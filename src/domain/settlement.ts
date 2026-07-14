import type { DailyBreakdownEntry, Settlement, StoredTransaction } from './models.js';

function* dateRange(from: string, to: string): Generator<string> {
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    yield cursor.toISOString().slice(0, 10);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

/**
 * Calcula la liquidación de un aliado (RF-04) a partir de transacciones limpias
 * (las marcadas por RF-05 no llegan aquí). net_points_owed se reporta en 0
 * cuando es negativo, pero el valor real se conserva en internal_net_points.
 */
export function buildSettlement(
  partnerId: string,
  from: string,
  to: string,
  transactions: StoredTransaction[],
): Settlement & { internal_net_points: number } {
  const byDay = new Map<string, DailyBreakdownEntry>();
  for (const date of dateRange(from, to)) {
    byDay.set(date, { date, transactions: 0, points_earned: 0, points_redeemed: 0 });
  }

  const members = new Set<string>();
  let totalEarned = 0;
  let totalRedeemed = 0;
  let partnerName = '';

  for (const tx of transactions) {
    const entry = byDay.get(tx.transaction_date);
    if (!entry) continue; // fuera del rango solicitado
    entry.transactions += 1;
    entry.points_earned += tx.points_earned;
    entry.points_redeemed += tx.points_redeemed;
    totalEarned += tx.points_earned;
    totalRedeemed += tx.points_redeemed;
    members.add(tx.member_id);
    if (!partnerName) partnerName = tx.partner_name;
  }

  const net = totalEarned - totalRedeemed;

  return {
    partner_id: partnerId,
    partner_name: partnerName,
    period: { from, to },
    summary: {
      total_transactions: [...byDay.values()].reduce((acc, d) => acc + d.transactions, 0),
      total_points_earned: totalEarned,
      total_points_redeemed: totalRedeemed,
      net_points_owed: Math.max(net, 0),
      unique_members: members.size,
    },
    daily_breakdown: [...byDay.values()],
    internal_net_points: net,
  };
}
