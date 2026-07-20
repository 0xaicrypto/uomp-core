import type { MemoryItem } from '@uomp/core';

export interface StoreStats {
  itemCount: number;
  totalSizeBytes: number;
  backend: string;
  encryptionEnabled: boolean;
}

export interface IMemoryStore {
  readonly backend: string;
  readonly isReady: boolean;

  connect(config?: Record<string, unknown>): Promise<void>;
  disconnect(): Promise<void>;

  get<T = unknown>(key: string): Promise<MemoryItem<T> | null>;
  getByTag<T = unknown>(tag: string): Promise<MemoryItem<T>[]>;
  getAll<T = unknown>(): Promise<MemoryItem<T>[]>;
  set<T = unknown>(item: Omit<MemoryItem<T>, 'createdAt' | 'updatedAt'> & Partial<Pick<MemoryItem<T>, 'createdAt' | 'updatedAt'>>): Promise<boolean>;
  delete(key: string): Promise<boolean>;

  listTags(): Promise<string[]>;
  count(): Promise<number>;
  stats(): Promise<StoreStats>;
}

export interface StoreBackendConfig {
  backend: 'sqlite' | 'encrypted-object' | 'ipfs';
  sqlite?: { dbPath: string };
  s3?: {
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  encryption?: {
    enabled: boolean;
    keyId?: string;
  };
}
