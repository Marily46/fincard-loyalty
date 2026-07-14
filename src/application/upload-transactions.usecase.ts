import { createHash, randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { applyBusinessRules } from '../domain/business-rules.js';
import type { FlaggedTransaction, Manifest, RowError, StoredTransaction } from '../domain/models.js';
import type { CatalogPort, Clock, StoragePort, TransactionRepository } from '../domain/ports.js';
import { validateHeader, validateRows } from '../domain/validation.js';

export interface UploadResult {
  status: 'processed' | 'processed_with_errors' | 'rejected';
  batch_id: string;
  summary: {
    total_rows: number;
    valid_rows: number;
    rejected_rows: number;
    flagged_rows: number;
  };
  errors: RowError[];
  flagged: Array<{ transaction_id: string; rule: string; reason: string }>;
}

export class FileLevelError extends Error {
  constructor(public readonly details: string[]) {
    super('El archivo no cumple el formato CSV esperado');
  }
}

export class UploadTransactionsUseCase {
  constructor(
    private readonly storage: StoragePort,
    private readonly catalog: CatalogPort,
    private readonly repository: TransactionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(fileBuffer: Buffer, filename: string): Promise<UploadResult> {
    let rawRows: Record<string, string>[];
    try {
      rawRows = parse(fileBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      }) as Record<string, string>[];
    } catch (error) {
      throw new FileLevelError([`CSV inválido: ${(error as Error).message}`]);
    }

    if (rawRows.length === 0) {
      throw new FileLevelError(['El archivo no contiene filas de datos']);
    }

    const headerErrors = validateHeader(Object.keys(rawRows[0] ?? {}));
    if (headerErrors.length > 0) {
      throw new FileLevelError(headerErrors);
    }

    const { valid, errors } = validateRows(rawRows);
    const { clean, flagged } = applyBusinessRules(valid, this.clock.today());

    const batchId = randomUUID();
    const processedAt = this.clock.now().toISOString();

    const storedClean: StoredTransaction[] = clean.map((t) => ({
      ...t,
      processed_at: processedAt,
      batch_id: batchId,
    }));
    const storedFlagged: FlaggedTransaction[] = flagged.map((f) => ({
      ...f.transaction,
      processed_at: processedAt,
      batch_id: batchId,
      rule: f.rule,
      flag_reason: f.reason,
    }));

    const manifest: Manifest = {
      batch_id: batchId,
      original_filename: filename,
      sha256: createHash('sha256').update(fileBuffer).digest('hex'),
      processed_at: processedAt,
      total_valid_rows: storedClean.length,
      total_rejected_rows: errors.length,
      total_flagged_rows: storedFlagged.length,
      errors,
    };

    const partitions = await this.storage.saveBatch(batchId, storedClean);
    await this.storage.saveManifest(manifest);
    await this.repository.saveTransactions(storedClean);
    await this.repository.saveFlagged(storedFlagged);
    await this.catalog.registerBatch(batchId, storedClean.length, partitions);

    return {
      status: errors.length === 0 ? 'processed' : 'processed_with_errors',
      batch_id: batchId,
      summary: {
        total_rows: rawRows.length,
        valid_rows: storedClean.length,
        rejected_rows: errors.length,
        flagged_rows: storedFlagged.length,
      },
      errors,
      flagged: storedFlagged.map((f) => ({
        transaction_id: f.transaction_id,
        rule: f.rule,
        reason: f.flag_reason,
      })),
    };
  }
}
