import { describe, expect, it } from 'vitest';
import { applyBusinessRules } from '../src/domain/business-rules.js';
import type { TransactionRow } from '../src/domain/models.js';

const TODAY = '2026-07-13';

let seq = 0;
function tx(overrides: Partial<TransactionRow>): TransactionRow {
  seq += 1;
  return {
    transaction_id: `TXN${String(seq).padStart(3, '0')}`,
    member_id: 'MEM001',
    partner_id: 'PART01',
    points_earned: 100,
    points_redeemed: 0,
    transaction_date: '2026-07-01',
    partner_name: 'Café Central',
    ...overrides,
  };
}

describe('RN-01: máximo 10.000 puntos netos por miembro y día', () => {
  it('marca la transacción que excede el acumulado diario', () => {
    const rows = [
      tx({ points_earned: 6000 }),
      tx({ points_earned: 4000 }), // acumulado exacto 10.000: permitido
      tx({ points_earned: 1 }), // 10.001: marcada
    ];
    const { clean, flagged } = applyBusinessRules(rows, TODAY);
    expect(clean).toHaveLength(2);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.rule).toBe('RN-01');
  });

  it('las redenciones descuentan del neto diario', () => {
    // 4 transacciones, 1 con redención (25% ≤ 30%) para no activar RN-02
    const rows = [
      tx({ points_earned: 9000 }),
      tx({ points_earned: 0, points_redeemed: 5000 }), // neto 4.000
      tx({ points_earned: 5000 }), // neto 9.000
      tx({ points_earned: 1000 }), // neto exacto 10.000: permitido
    ];
    const { flagged } = applyBusinessRules(rows, TODAY);
    expect(flagged).toHaveLength(0);
  });

  it('no cruza miembros ni días distintos', () => {
    const rows = [
      tx({ points_earned: 9000, member_id: 'MEM001' }),
      tx({ points_earned: 9000, member_id: 'MEM002' }),
      tx({ points_earned: 9000, member_id: 'MEM001', transaction_date: '2026-07-02' }),
    ];
    const { flagged } = applyBusinessRules(rows, TODAY);
    expect(flagged).toHaveLength(0);
  });
});

describe('RN-02: máximo 30% de transacciones diarias con redención por aliado', () => {
  it('marca las redenciones que exceden el 30% diario', () => {
    // 10 transacciones, 4 con redención (40%) => permitidas floor(3), 1 marcada
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => tx({ member_id: `MEM10${i}`.slice(0, 6) })),
      tx({ member_id: 'MEM201', points_redeemed: 100, points_earned: 0 }),
      tx({ member_id: 'MEM202', points_redeemed: 100, points_earned: 0 }),
      tx({ member_id: 'MEM203', points_redeemed: 100, points_earned: 0 }),
      tx({ member_id: 'MEM204', points_redeemed: 100, points_earned: 0 }),
    ];
    const { flagged } = applyBusinessRules(rows, TODAY);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.rule).toBe('RN-02');
    expect(flagged[0]?.transaction.member_id).toBe('MEM204');
  });

  it('no marca cuando la proporción es exactamente 30%', () => {
    const rows = [
      ...Array.from({ length: 7 }, (_, i) => tx({ member_id: `MEM30${i}`.slice(0, 6) })),
      tx({ member_id: 'MEM401', points_redeemed: 100, points_earned: 0 }),
      tx({ member_id: 'MEM402', points_redeemed: 100, points_earned: 0 }),
      tx({ member_id: 'MEM403', points_redeemed: 100, points_earned: 0 }),
    ];
    const { flagged } = applyBusinessRules(rows, TODAY);
    expect(flagged).toHaveLength(0);
  });
});

describe('RN-03: máximo 5 transacciones por miembro/aliado/día', () => {
  it('marca desde la sexta transacción', () => {
    const rows = Array.from({ length: 7 }, () => tx({ points_earned: 10 }));
    const { clean, flagged } = applyBusinessRules(rows, TODAY);
    expect(clean).toHaveLength(5);
    expect(flagged).toHaveLength(2);
    expect(flagged.every((f) => f.rule === 'RN-03')).toBe(true);
  });

  it('no marca con aliados distintos', () => {
    const rows = [
      ...Array.from({ length: 5 }, () => tx({ points_earned: 10, partner_id: 'PART01' })),
      ...Array.from({ length: 5 }, () => tx({ points_earned: 10, partner_id: 'PART02' })),
    ];
    const { flagged } = applyBusinessRules(rows, TODAY);
    expect(flagged).toHaveLength(0);
  });
});

describe('RN-04: rango de fechas permitido', () => {
  it('marca fechas futuras', () => {
    const { flagged } = applyBusinessRules([tx({ transaction_date: '2026-07-14' })], TODAY);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.rule).toBe('RN-04');
  });

  it('marca fechas de más de 2 años atrás', () => {
    const { flagged } = applyBusinessRules([tx({ transaction_date: '2024-07-12' })], TODAY);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.rule).toBe('RN-04');
  });

  it('acepta hoy y el límite exacto de 2 años', () => {
    const { flagged } = applyBusinessRules(
      [tx({ transaction_date: TODAY }), tx({ transaction_date: '2024-07-13' })],
      TODAY,
    );
    expect(flagged).toHaveLength(0);
  });

  it('una transacción marcada por RN-04 no cuenta para RN-01', () => {
    const rows = [
      tx({ points_earned: 9000, transaction_date: '2026-07-14' }), // RN-04
      tx({ points_earned: 9000 }), // sin la anterior, no excede
    ];
    const { clean, flagged } = applyBusinessRules(rows, TODAY);
    expect(clean).toHaveLength(1);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.rule).toBe('RN-04');
  });
});
