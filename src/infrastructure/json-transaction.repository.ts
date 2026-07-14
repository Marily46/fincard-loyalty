import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { FlaggedTransaction, StoredTransaction } from '../domain/models.js';
import type { TransactionRepository } from '../domain/ports.js';

interface DbFile {
  transactions: StoredTransaction[];
  transactions_flagged: FlaggedTransaction[];
}

/**
 * Repositorio persistido en JSON para desarrollo local. El puerto
 * TransactionRepository permite sustituirlo por PostgreSQL/Redshift
 * sin cambios en el dominio.
 */
export class JsonTransactionRepository implements TransactionRepository {
  constructor(private readonly filePath: string) {}

  async saveTransactions(transactions: StoredTransaction[]): Promise<void> {
    if (transactions.length === 0) return;
    const db = await this.read();
    db.transactions.push(...transactions);
    await this.write(db);
  }

  async saveFlagged(flagged: FlaggedTransaction[]): Promise<void> {
    if (flagged.length === 0) return;
    const db = await this.read();
    db.transactions_flagged.push(...flagged);
    await this.write(db);
  }

  async findByPartnerAndRange(partnerId: string, from: string, to: string): Promise<StoredTransaction[]> {
    const db = await this.read();
    return db.transactions.filter(
      (t) => t.partner_id === partnerId && t.transaction_date >= from && t.transaction_date <= to,
    );
  }

  private async read(): Promise<DbFile> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as DbFile;
    } catch {
      return { transactions: [], transactions_flagged: [] };
    }
  }

  private async write(db: DbFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(db, null, 2), 'utf8');
  }
}
