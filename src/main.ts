import { join } from 'node:path';
import { GetSettlementUseCase } from './application/get-settlement.usecase.js';
import { UploadTransactionsUseCase } from './application/upload-transactions.usecase.js';
import { buildServer } from './http/server.js';
import { FsStorageAdapter } from './infrastructure/fs-storage.adapter.js';
import { JsonCatalogAdapter } from './infrastructure/json-catalog.adapter.js';
import { JsonTransactionRepository } from './infrastructure/json-transaction.repository.js';
import { SystemClock } from './infrastructure/system-clock.js';

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data');
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  const storage = new FsStorageAdapter(join(DATA_DIR, 's3'));
  const catalog = new JsonCatalogAdapter(join(DATA_DIR, 'glue-catalog.json'));
  const repository = new JsonTransactionRepository(join(DATA_DIR, 'db.json'));
  const clock = new SystemClock();

  const app = await buildServer({
    uploadTransactions: new UploadTransactionsUseCase(storage, catalog, repository, clock),
    getSettlement: new GetSettlementUseCase(repository),
  });

  await app.listen({ port: PORT, host: HOST });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
