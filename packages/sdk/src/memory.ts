import { Transport } from './transport.js';
import type { MemoryItem } from './types.js';

export class MemoryClient {
  constructor(private transport: Transport) {}

  async get<T = Record<string, unknown>>(key: string): Promise<MemoryItem<T> | null> {
    try {
      return await this.transport.requestJson<MemoryItem<T>>(`/v1/memory/${encodeURIComponent(key)}`);
    } catch (err: any) {
      if (err?.statusCode === 404) return null;
      throw err;
    }
  }

  async getByTag<T = Record<string, unknown>>(tag: string): Promise<MemoryItem<T>[]> {
    const data = await this.transport.requestJson<{ items: MemoryItem<T>[] }>(
      `/v1/memory?tag=${encodeURIComponent(tag)}`
    );
    return data.items;
  }

  async getByKeys<T = Record<string, unknown>>(keys: string[]): Promise<MemoryItem<T>[]> {
    const results = await Promise.all(keys.map(k => this.get<T>(k).catch(() => null)));
    return results.filter((r): r is MemoryItem<T> => r !== null);
  }
}
