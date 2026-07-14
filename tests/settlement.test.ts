import { describe, expect, it } from 'vitest';
import type { StoredTransaction } from '../src/domain/models.js';
import { buildSettlement } from '../src/domain/settlement.js';

function stored(overrides: Partial<StoredTransaction>): StoredTransaction {
  return {
    transaction_id: 'TXN001',
    member_id: 'MEM001',
    partner_id: 'PART01',
    points_earned: 100,
    points_redeemed: 0,
    transaction_date: '2026-07-01',
    partner_name: 'Café Central',
    processed_at: '2026-07-13T00:00:00.000Z',
    batch_id: 'batch-1',
    ...overrides,
  };
}

describe('buildSettlement', () => {
  it('agrega totales, miembros únicos y neto', () => {
    const txs = [
      stored({ transaction_id: 'T1', member_id: 'MEM001', points_earned: 150 }),
      stored({ transaction_id: 'T2', member_id: 'MEM002', points_earned: 0, points_redeemed: 50 }),
      stored({ transaction_id: 'T3', member_id: 'MEM001', points_earned: 200, transaction_date: '2026-07-02' }),
    ];
    const s = buildSettlement('PART01', '2026-07-01', '2026-07-03', txs);
    expect(s.summary).toEqual({
      total_transactions: 3,
      total_points_earned: 350,
      total_points_redeemed: 50,
      net_points_owed: 300,
      unique_members: 2,
    });
    expect(s.partner_name).toBe('Café Central');
  });

  it('incluye todos los días del rango, con ceros donde no hay transacciones', () => {
    const s = buildSettlement('PART01', '2026-07-01', '2026-07-05', [
      stored({ transaction_date: '2026-07-03' }),
    ]);
    expect(s.daily_breakdown).toHaveLength(5);
    expect(s.daily_breakdown.map((d) => d.date)).toEqual([
      '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05',
    ]);
    expect(s.daily_breakdown[0]).toMatchObject({ transactions: 0, points_earned: 0 });
    expect(s.daily_breakdown[2]).toMatchObject({ transactions: 1, points_earned: 100 });
  });

  it('reporta net_points_owed en 0 cuando es negativo, conservando el valor interno', () => {
    const s = buildSettlement('PART01', '2026-07-01', '2026-07-01', [
      stored({ points_earned: 100, points_redeemed: 400 }),
    ]);
    expect(s.summary.net_points_owed).toBe(0);
    expect(s.internal_net_points).toBe(-300);
  });

  it('cruza correctamente un rango que cambia de mes', () => {
    const s = buildSettlement('PART01', '2026-06-29', '2026-07-02', []);
    expect(s.daily_breakdown.map((d) => d.date)).toEqual([
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02',
    ]);
  });
});
