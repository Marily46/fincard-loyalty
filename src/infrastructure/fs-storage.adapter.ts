import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Manifest, StoredTransaction } from '../domain/models.js';
import type { StoragePort } from '../domain/ports.js';

/**
 * Adapter local que emula Amazon S3 sobre el filesystem.
 * En producción se sustituye por un adapter basado en @aws-sdk/client-s3
 * sin tocar dominio ni casos de uso (mismo puerto StoragePort).
 *
 * Layout: {root}/fincard-transactions/{year}/{month}/{partner_id}/{batch_id}.json
 */
export class FsStorageAdapter implements StoragePort {
  constructor(private readonly root: string) {}

  async saveBatch(batchId: string, transactions: StoredTransaction[]): Promise<string[]> {
    const groups = new Map<string, StoredTransaction[]>();
    for (const tx of transactions) {
      const [year, month] = tx.transaction_date.split('-') as [string, string];
      const key = join('fincard-transactions', year, month, tx.partner_id);
      const list = groups.get(key) ?? [];
      list.push(tx);
      groups.set(key, list);
    }

    const partitions: string[] = [];
    for (const [relativeDir, group] of groups) {
      const dir = join(this.root, relativeDir);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${batchId}.json`), JSON.stringify(group, null, 2), 'utf8');
      partitions.push(relativeDir.replaceAll('\\', '/'));
    }
    return partitions;
  }

  async saveManifest(manifest: Manifest): Promise<string> {
    const dir = join(this.root, 'fincard-transactions', '_manifests');
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${manifest.batch_id}.json`);
    await writeFile(path, JSON.stringify(manifest, null, 2), 'utf8');
    return path;
  }
}
