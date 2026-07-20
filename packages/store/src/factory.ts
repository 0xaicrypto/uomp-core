import { homedir } from 'os';
import { join } from 'path';
import { MemoryStore, AsyncStoreAdapter } from './index.js';
import type { IMemoryStore, StoreBackendConfig } from './types.js';

export async function createStore(config?: StoreBackendConfig): Promise<IMemoryStore> {
  const backend = config?.backend ?? 'sqlite';

  switch (backend) {
    case 'sqlite': {
      const dbPath = config?.sqlite?.dbPath ?? join(homedir(), '.uomp', 'memory.db');
      const store = new MemoryStore({ dbPath });
      return new AsyncStoreAdapter(store);
    }
    case 'encrypted-object':
      throw new Error('Encrypted Object Store not yet implemented (Phase 3)');
    case 'ipfs':
      throw new Error('IPFS Store not yet implemented');
    default:
      throw new Error(`Unknown store backend: ${backend}`);
  }
}
