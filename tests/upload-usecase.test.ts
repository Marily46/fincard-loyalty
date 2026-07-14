import { describe, expect, it } from 'vitest';
import { FileLevelError, UploadTransactionsUseCase } from '../src/application/upload-transactions.usecase.js';
import type { FlaggedTransaction, Manifest, StoredTransaction } from '../src/domain/models.js';
import type { CatalogPort, Clock, StoragePort, TransactionRepository } from '../src/domain/ports.js';

class InMemoryStorage implements StoragePort {
  batches: StoredTransaction[][] = [];
  manifests: Manifest[] = [];
  async saveBatch(_batchId: string, transactions: StoredTransaction[]): Promise<string[]> {
    this.batches.push(transactions);
    return [...new Set(transactions.map((t) => {
      const [y, m] = t.transaction_date.split('-');
      return `fincard-transactions/${y}/${m}/${t.partner_id}`;
    }))];
  }
  async saveManifest(manifest: Manifest): Promise<string> {
    this.manifests.push(manifest);
    return `memory://${manifest.batch_id}`;
  }
}

class InMemoryCatalog implements CatalogPort {
  registrations: Array<{ batchId: string; rowCount: number; partitions: string[] }> = [];
  async registerBatch(batchId: string, rowCount: number, partitions: string[]): Promise<void> {
    this.registrations.push({ batchId, rowCount, partitions });
  }
}

class InMemoryRepository implements TransactionRepository {
  transactions: StoredTransaction[] = [];
  flagged: FlaggedTransaction[] = [];
  async saveTransactions(t: StoredTransaction[]): Promise<void> { this.transactions.push(...t); }
  async saveFlagged(f: FlaggedTransaction[]): Promise<void> { this.flagged.push(...f); }
  async findByPartnerAndRange(partnerId: string, from: string, to: string): Promise<StoredTransaction[]> {
    return this.transactions.filter(
      (t) => t.partner_id === partnerId && t.transaction_date >= from && t.transaction_date <= to,
    );
  }
}

const fixedClock: Clock = {
  today: () => '2026-07-13',
  now: () => new Date('2026-07-13T12:00:00.000Z'),
};

function build() {
  const storage = new InMemoryStorage();
  const catalog = new InMemoryCatalog();
  const repository = new InMemoryRepository();
  const useCase = new UploadTransactionsUseCase(storage, catalog, repository, fixedClock);
  return { storage, catalog, repository, useCase };
}

const HEADER = 'transaction_id,member_id,partner_id,points_earned,points_redeemed,transaction_date,partner_name';

describe('UploadTransactionsUseCase', () => {
  it('procesa un archivo completamente válido', async () => {
    const { storage, catalog, repository, useCase } = build();
    const csv = [
      HEADER,
      'TXN001,MEM001,PART01,150,0,2026-07-01,Café Central',
      'TXN002,MEM002,PART02,200,0,2026-07-01,Gasolinera Express',
    ].join('\n');

    const result = await useCase.execute(Buffer.from(csv, 'utf8'), 'ok.csv');

    expect(result.status).toBe('processed');
    expect(result.summary).toMatchObject({ total_rows: 2, valid_rows: 2, rejected_rows: 0, flagged_rows: 0 });
    expect(repository.transactions).toHaveLength(2);
    expect(storage.manifests[0]).toMatchObject({ total_valid_rows: 2, total_rejected_rows: 0 });
    expect(storage.manifests[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(catalog.registrations).toHaveLength(1);
  });

  it('separa filas rechazadas, marcadas y limpias', async () => {
    const { repository, storage, useCase } = build();
    const csv = [
      HEADER,
      'TXN001,MEM001,PART01,150,0,2026-07-01,Café Central', // limpia
      'TXN002,BADID,PART01,100,0,2026-07-01,Café Central', // rechazada (member_id)
      'TXN003,MEM002,PART01,50,0,2026-07-14,Café Central', // marcada RN-04 (futura)
    ].join('\n');

    const result = await useCase.execute(Buffer.from(csv, 'utf8'), 'mixto.csv');

    expect(result.status).toBe('processed_with_errors');
    expect(result.summary).toMatchObject({ valid_rows: 1, rejected_rows: 1, flagged_rows: 1 });
    expect(result.errors[0]?.row).toBe(2);
    expect(result.flagged[0]).toMatchObject({ transaction_id: 'TXN003', rule: 'RN-04' });
    expect(repository.transactions.map((t) => t.transaction_id)).toEqual(['TXN001']);
    expect(repository.flagged.map((t) => t.transaction_id)).toEqual(['TXN003']);
    expect(storage.manifests[0]?.errors).toHaveLength(1);
  });

  it('las transacciones marcadas no afectan la liquidación', async () => {
    const { repository, useCase } = build();
    const csv = [
      HEADER,
      'TXN001,MEM001,PART01,150,0,2026-07-01,Café Central',
      'TXN002,MEM001,PART01,20000,0,2026-07-01,Café Central', // RN-01
    ].join('\n');

    await useCase.execute(Buffer.from(csv, 'utf8'), 'flagged.csv');

    const visible = await repository.findByPartnerAndRange('PART01', '2026-07-01', '2026-07-31');
    expect(visible).toHaveLength(1);
    expect(visible[0]?.transaction_id).toBe('TXN001');
  });

  it('rechaza archivos sin las columnas requeridas', async () => {
    const { useCase } = build();
    const csv = 'foo,bar\n1,2';
    await expect(useCase.execute(Buffer.from(csv, 'utf8'), 'malo.csv')).rejects.toThrow(FileLevelError);
  });

  it('rechaza archivos vacíos', async () => {
    const { useCase } = build();
    await expect(useCase.execute(Buffer.from(`${HEADER}\n`, 'utf8'), 'vacio.csv')).rejects.toThrow(FileLevelError);
  });
});
