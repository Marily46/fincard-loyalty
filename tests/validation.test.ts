import { describe, expect, it } from 'vitest';
import { validateHeader, validateRows } from '../src/domain/validation.js';

const validRow = {
  transaction_id: 'TXN001',
  member_id: 'MEM001',
  partner_id: 'PART01',
  points_earned: '150',
  points_redeemed: '0',
  transaction_date: '2026-07-01',
  partner_name: 'Café Central',
};

describe('validateHeader', () => {
  it('acepta el header completo', () => {
    expect(validateHeader(Object.keys(validRow))).toEqual([]);
  });

  it('reporta columnas faltantes', () => {
    const errors = validateHeader(['transaction_id', 'member_id']);
    expect(errors.length).toBe(5);
    expect(errors[0]).toContain('partner_id');
  });
});

describe('validateRows', () => {
  it('acepta una fila válida', () => {
    const { valid, errors } = validateRows([validRow]);
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({ points_earned: 150, points_redeemed: 0 });
  });

  it('rechaza member_id con formato inválido', () => {
    const { valid, errors } = validateRows([{ ...validRow, member_id: 'MEMBER1' }]);
    expect(valid).toHaveLength(0);
    expect(errors[0]?.errors[0]).toContain('member_id inválido');
  });

  it('rechaza partner_id con formato inválido', () => {
    const { errors } = validateRows([{ ...validRow, partner_id: 'PART001' }]);
    expect(errors[0]?.errors[0]).toContain('partner_id inválido');
  });

  it('rechaza puntos negativos o no enteros', () => {
    const { errors } = validateRows([
      { ...validRow, points_earned: '-5' },
      { ...validRow, transaction_id: 'TXN002', points_redeemed: '3.5' },
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.errors[0]).toContain('points_earned inválido');
    expect(errors[1]?.errors[0]).toContain('points_redeemed inválido');
  });

  it('rechaza fechas inválidas (formato y calendario)', () => {
    const { errors } = validateRows([
      { ...validRow, transaction_date: '01/07/2026' },
      { ...validRow, transaction_id: 'TXN002', transaction_date: '2026-02-30' },
    ]);
    expect(errors).toHaveLength(2);
  });

  it('rechaza transaction_id duplicados dentro del archivo', () => {
    const { valid, errors } = validateRows([validRow, { ...validRow }]);
    expect(valid).toHaveLength(1);
    expect(errors[0]?.row).toBe(2);
    expect(errors[0]?.errors[0]).toContain('duplicado');
  });

  it('acumula múltiples errores en la misma fila', () => {
    const { errors } = validateRows([
      { ...validRow, member_id: 'X', partner_id: 'Y', points_earned: 'abc' },
    ]);
    expect(errors[0]?.errors.length).toBeGreaterThanOrEqual(3);
  });
});
