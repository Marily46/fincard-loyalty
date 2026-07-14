import type { FlaggedTransaction, Manifest, StoredTransaction } from './models.js';

/**
 * Puerto de almacenamiento de objetos (S3 en producción, filesystem local en desarrollo).
 */
export interface StoragePort {
  /** Guarda las transacciones de un batch bajo {year}/{month}/{partner_id}/ */
  saveBatch(batchId: string, transactions: StoredTransaction[]): Promise<string[]>;
  saveManifest(manifest: Manifest): Promise<string>;
}

/**
 * Puerto de catalogación de datos (AWS Glue Data Catalog en producción).
 */
export interface CatalogPort {
  registerBatch(batchId: string, rowCount: number, partitions: string[]): Promise<void>;
}

/**
 * Puerto de persistencia consultable de transacciones.
 */
export interface TransactionRepository {
  saveTransactions(transactions: StoredTransaction[]): Promise<void>;
  saveFlagged(flagged: FlaggedTransaction[]): Promise<void>;
  findByPartnerAndRange(partnerId: string, from: string, to: string): Promise<StoredTransaction[]>;
}

/** Reloj inyectable para poder testear reglas dependientes de la fecha actual. */
export interface Clock {
  today(): string; // YYYY-MM-DD
  now(): Date;
}
