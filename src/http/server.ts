import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import type { GetSettlementUseCase } from '../application/get-settlement.usecase.js';
import type { UploadTransactionsUseCase } from '../application/upload-transactions.usecase.js';
import { registerSettlementRoutes } from './routes/settlements.route.js';
import { registerTransactionRoutes } from './routes/transactions.route.js';

export interface AppDependencies {
  uploadTransactions: UploadTransactionsUseCase;
  getSettlement: GetSettlementUseCase;
}

export async function buildServer(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  });

  app.get('/health', async () => ({ status: 'ok' }));

  await registerTransactionRoutes(app, deps.uploadTransactions);
  await registerSettlementRoutes(app, deps.getSettlement);

  return app;
}
