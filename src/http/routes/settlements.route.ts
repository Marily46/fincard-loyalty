import type { FastifyInstance } from 'fastify';
import {
  InvalidSettlementQueryError,
  type GetSettlementUseCase,
} from '../../application/get-settlement.usecase.js';

interface SettlementParams {
  partner_id: string;
}

interface SettlementQuery {
  from: string;
  to: string;
}

export async function registerSettlementRoutes(
  app: FastifyInstance,
  getSettlement: GetSettlementUseCase,
): Promise<void> {
  app.get<{ Params: SettlementParams; Querystring: SettlementQuery }>(
    '/api/v1/settlements/:partner_id',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['from', 'to'],
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const settlement = await getSettlement.execute(
          request.params.partner_id,
          request.query.from,
          request.query.to,
        );
        return reply.send(settlement);
      } catch (error) {
        if (error instanceof InvalidSettlementQueryError) {
          return reply.code(400).send({ message: error.message, errors: error.details });
        }
        throw error;
      }
    },
  );
}
