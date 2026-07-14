import type { Settlement } from '../domain/models.js';
import type { TransactionRepository } from '../domain/ports.js';
import { buildSettlement } from '../domain/settlement.js';
import { isValidDate } from '../domain/validation.js';

export class InvalidSettlementQueryError extends Error {
  constructor(public readonly details: string[]) {
    super('Parámetros de consulta inválidos');
  }
}

export class GetSettlementUseCase {
  constructor(private readonly repository: TransactionRepository) {}

  async execute(partnerId: string, from: string, to: string): Promise<Settlement> {
    const errors: string[] = [];
    if (!/^PART\d{2}$/.test(partnerId)) {
      errors.push(`partner_id inválido: "${partnerId}" (formato esperado: PART + 2 dígitos)`);
    }
    if (!isValidDate(from)) errors.push(`Parámetro "from" inválido: "${from}" (YYYY-MM-DD)`);
    if (!isValidDate(to)) errors.push(`Parámetro "to" inválido: "${to}" (YYYY-MM-DD)`);
    if (errors.length === 0 && from > to) {
      errors.push(`El rango es inválido: from (${from}) es posterior a to (${to})`);
    }
    if (errors.length > 0) throw new InvalidSettlementQueryError(errors);

    const transactions = await this.repository.findByPartnerAndRange(partnerId, from, to);
    const { internal_net_points: _internal, ...settlement } = buildSettlement(
      partnerId,
      from,
      to,
      transactions,
    );
    return settlement;
  }
}
