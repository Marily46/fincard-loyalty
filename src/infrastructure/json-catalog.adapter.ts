import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CatalogPort } from '../domain/ports.js';

interface CatalogFile {
  databases: {
    [db: string]: {
      tables: {
        [table: string]: {
          columns: Array<{ name: string; type: string }>;
          partitions: string[];
          batches: Array<{ batch_id: string; row_count: number; registered_at: string }>;
        };
      };
    };
  };
}

const DATABASE = 'fincard_loyalty';
const TABLE = 'transactions';

const TABLE_COLUMNS = [
  { name: 'transaction_id', type: 'STRING' },
  { name: 'member_id', type: 'STRING' },
  { name: 'partner_id', type: 'STRING' },
  { name: 'points_earned', type: 'INT' },
  { name: 'points_redeemed', type: 'INT' },
  { name: 'transaction_date', type: 'DATE' },
  { name: 'partner_name', type: 'STRING' },
  { name: 'processed_at', type: 'TIMESTAMP' },
  { name: 'batch_id', type: 'STRING' },
];

/**
 * Adapter local que emula AWS Glue Data Catalog persistiendo la catalogación
 * en un JSON. En producción: @aws-sdk/client-glue (CreateDatabase/UpdateTable).
 */
export class JsonCatalogAdapter implements CatalogPort {
  constructor(private readonly filePath: string) {}

  async registerBatch(batchId: string, rowCount: number, partitions: string[]): Promise<void> {
    const catalog = await this.read();
    const db = (catalog.databases[DATABASE] ??= { tables: {} });
    const table = (db.tables[TABLE] ??= { columns: TABLE_COLUMNS, partitions: [], batches: [] });

    table.columns = TABLE_COLUMNS;
    for (const partition of partitions) {
      if (!table.partitions.includes(partition)) table.partitions.push(partition);
    }
    table.batches.push({ batch_id: batchId, row_count: rowCount, registered_at: new Date().toISOString() });

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(catalog, null, 2), 'utf8');
  }

  private async read(): Promise<CatalogFile> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as CatalogFile;
    } catch {
      return { databases: {} };
    }
  }
}
