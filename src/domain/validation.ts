import type { RowError, TransactionRow } from './models.js';

export const REQUIRED_COLUMNS = [
  'transaction_id',
  'member_id',
  'partner_id',
  'points_earned',
  'points_redeemed',
  'transaction_date',
  'partner_name',
] as const;

const MEMBER_ID_PATTERN = /^MEM\d{3}$/;
const PARTNER_ID_PATTERN = /^PART\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NON_NEGATIVE_INT_PATTERN = /^\d+$/;

export interface ValidationResult {
  valid: TransactionRow[];
  errors: RowError[];
}

export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateHeader(columns: string[]): string[] {
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  return missing.map((c) => `Columna requerida ausente: ${c}`);
}

/**
 * Validación estructural fila a fila (RF-01). Las filas inválidas se rechazan;
 * las válidas continúan hacia las reglas de negocio (RF-05).
 */
export function validateRows(rawRows: Record<string, string>[]): ValidationResult {
  const valid: TransactionRow[] = [];
  const errors: RowError[] = [];
  const seenIds = new Map<string, number>();

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 1;
    const rowErrors: string[] = [];

    for (const column of REQUIRED_COLUMNS) {
      if (raw[column] === undefined || raw[column].trim() === '') {
        rowErrors.push(`Campo requerido vacío o ausente: ${column}`);
      }
    }

    const transactionId = (raw.transaction_id ?? '').trim();
    const memberId = (raw.member_id ?? '').trim();
    const partnerId = (raw.partner_id ?? '').trim();
    const pointsEarnedRaw = (raw.points_earned ?? '').trim();
    const pointsRedeemedRaw = (raw.points_redeemed ?? '').trim();
    const transactionDate = (raw.transaction_date ?? '').trim();

    if (memberId && !MEMBER_ID_PATTERN.test(memberId)) {
      rowErrors.push(`member_id inválido: "${memberId}" (formato esperado: MEM + 3 dígitos)`);
    }
    if (partnerId && !PARTNER_ID_PATTERN.test(partnerId)) {
      rowErrors.push(`partner_id inválido: "${partnerId}" (formato esperado: PART + 2 dígitos)`);
    }
    if (pointsEarnedRaw && !NON_NEGATIVE_INT_PATTERN.test(pointsEarnedRaw)) {
      rowErrors.push(`points_earned inválido: "${pointsEarnedRaw}" (se espera entero no negativo)`);
    }
    if (pointsRedeemedRaw && !NON_NEGATIVE_INT_PATTERN.test(pointsRedeemedRaw)) {
      rowErrors.push(`points_redeemed inválido: "${pointsRedeemedRaw}" (se espera entero no negativo)`);
    }
    if (transactionDate && !isValidDate(transactionDate)) {
      rowErrors.push(`transaction_date inválida: "${transactionDate}" (formato esperado: YYYY-MM-DD)`);
    }

    if (transactionId) {
      const firstSeenAt = seenIds.get(transactionId);
      if (firstSeenAt !== undefined) {
        rowErrors.push(`transaction_id duplicado en el archivo: "${transactionId}" (visto primero en fila ${firstSeenAt})`);
      } else {
        seenIds.set(transactionId, rowNumber);
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ row: rowNumber, errors: rowErrors });
      return;
    }

    valid.push({
      transaction_id: transactionId,
      member_id: memberId,
      partner_id: partnerId,
      points_earned: Number(pointsEarnedRaw),
      points_redeemed: Number(pointsRedeemedRaw),
      transaction_date: transactionDate,
      partner_name: (raw.partner_name ?? '').trim(),
    });
  });

  return { valid, errors };
}
