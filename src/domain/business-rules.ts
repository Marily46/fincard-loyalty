import type { BusinessRule, TransactionRow } from './models.js';

export interface FlagResult {
  transaction: TransactionRow;
  rule: BusinessRule;
  reason: string;
}

export interface BusinessRulesOutcome {
  clean: TransactionRow[];
  flagged: FlagResult[];
}

const MAX_DAILY_NET_POINTS = 10_000; // RN-01
const MAX_DAILY_REDEMPTION_RATIO = 0.3; // RN-02
const MAX_DAILY_TXNS_PER_MEMBER_PARTNER = 5; // RN-03
const MAX_HISTORY_YEARS = 2; // RN-04

/**
 * Aplica las reglas de negocio RN-01 a RN-04 (RF-05) sobre filas ya
 * estructuralmente válidas. Las reglas se evalúan en orden de prioridad
 * (RN-04 → RN-01 → RN-03 → RN-02) y cada transacción se marca a lo sumo
 * una vez, con la primera regla que incumpla. Las transacciones marcadas
 * no participan en los agregados de las reglas siguientes.
 */
export function applyBusinessRules(rows: TransactionRow[], today: string): BusinessRulesOutcome {
  const flagged = new Map<TransactionRow, FlagResult>();

  const flag = (transaction: TransactionRow, rule: BusinessRule, reason: string) => {
    if (!flagged.has(transaction)) {
      flagged.set(transaction, { transaction, rule, reason });
    }
  };

  // RN-04: fecha fuera de rango (futura o más de 2 años atrás)
  const todayDate = new Date(`${today}T00:00:00Z`);
  const minDate = new Date(todayDate);
  minDate.setUTCFullYear(minDate.getUTCFullYear() - MAX_HISTORY_YEARS);
  for (const row of rows) {
    const txDate = new Date(`${row.transaction_date}T00:00:00Z`);
    if (txDate.getTime() > todayDate.getTime()) {
      flag(row, 'RN-04', `transaction_date ${row.transaction_date} es posterior a la fecha actual (${today})`);
    } else if (txDate.getTime() < minDate.getTime()) {
      flag(row, 'RN-04', `transaction_date ${row.transaction_date} es anterior al límite de ${MAX_HISTORY_YEARS} años`);
    }
  }

  // RN-01: máximo 10.000 puntos netos acumulados por miembro y día.
  // Se procesa en orden de archivo; la transacción que excede el límite
  // (y las siguientes que sigan sumando) quedan "sujetas a revisión".
  const netByMemberDay = new Map<string, number>();
  for (const row of rows) {
    if (flagged.has(row)) continue;
    const key = `${row.member_id}|${row.transaction_date}`;
    const current = netByMemberDay.get(key) ?? 0;
    const next = current + row.points_earned - row.points_redeemed;
    if (next > MAX_DAILY_NET_POINTS) {
      flag(row, 'RN-01', `El miembro ${row.member_id} supera ${MAX_DAILY_NET_POINTS} puntos netos el ${row.transaction_date} (acumulado: ${next})`);
    } else {
      netByMemberDay.set(key, next);
    }
  }

  // RN-03: máximo 5 transacciones por miembro con el mismo aliado el mismo día.
  const countByMemberPartnerDay = new Map<string, number>();
  for (const row of rows) {
    if (flagged.has(row)) continue;
    const key = `${row.member_id}|${row.partner_id}|${row.transaction_date}`;
    const count = (countByMemberPartnerDay.get(key) ?? 0) + 1;
    countByMemberPartnerDay.set(key, count);
    if (count > MAX_DAILY_TXNS_PER_MEMBER_PARTNER) {
      flag(row, 'RN-03', `El miembro ${row.member_id} supera ${MAX_DAILY_TXNS_PER_MEMBER_PARTNER} transacciones con ${row.partner_id} el ${row.transaction_date} (transacción #${count})`);
    }
  }

  // RN-02: un aliado no puede tener más del 30% de sus transacciones diarias
  // con points_redeemed > 0. Se permite floor(30% del total) redenciones;
  // las redenciones excedentes (en orden de archivo) se marcan.
  const byPartnerDay = new Map<string, TransactionRow[]>();
  for (const row of rows) {
    if (flagged.has(row)) continue;
    const key = `${row.partner_id}|${row.transaction_date}`;
    const list = byPartnerDay.get(key) ?? [];
    list.push(row);
    byPartnerDay.set(key, list);
  }
  for (const [, dayRows] of byPartnerDay) {
    const redemptions = dayRows.filter((r) => r.points_redeemed > 0);
    const ratio = redemptions.length / dayRows.length;
    if (ratio > MAX_DAILY_REDEMPTION_RATIO) {
      const allowed = Math.floor(dayRows.length * MAX_DAILY_REDEMPTION_RATIO);
      for (const row of redemptions.slice(allowed)) {
        flag(row, 'RN-02', `El aliado ${row.partner_id} supera el ${MAX_DAILY_REDEMPTION_RATIO * 100}% de transacciones con redención el ${row.transaction_date} (${redemptions.length}/${dayRows.length})`);
      }
    }
  }

  return {
    clean: rows.filter((row) => !flagged.has(row)),
    flagged: [...flagged.values()],
  };
}
