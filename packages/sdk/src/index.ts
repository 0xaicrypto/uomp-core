export { UompClient } from './client.js';
export { Transport } from './transport.js';
export { MemoryClient } from './memory.js';
export { AggregateClient } from './aggregate.js';
export { PayloadClient } from './payload.js';
export { SessionClient } from './session.js';
export { AuditClient } from './audit.js';
export { UompError, UompErrorCode } from './errors.js';
export * from './types.js';

// ── Backward compatibility ────────────────────────────────────────

import { MemoryClient } from './memory.js';
import { Transport } from './transport.js';
import type { MemoryItem } from './types.js';

export interface UserMemoryClientOptions {
  baseUrl?: string;
  token: string;
  agentId?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export class UserMemory {
  private memory: MemoryClient;
  private transport: Transport;

  constructor(options: UserMemoryClientOptions) {
    this.transport = new Transport({
      baseUrl: options.baseUrl ?? 'http://127.0.0.1:9374',
      agentId: options.agentId,
      transport: {
        timeout: options.timeoutMs ?? 10000,
        fetch: options.fetch,
      },
    }, () => options.token);

    this.memory = new MemoryClient(this.transport);
  }

  async get<T = unknown>(key: string): Promise<MemoryItem<T> | null> {
    return this.memory.get<T>(key);
  }

  async getByTag<T = unknown>(tag: string): Promise<MemoryItem<T>[]> {
    return this.memory.getByTag<T>(tag);
  }

  async set<T = unknown>(_key: string, _value: T): Promise<boolean> {
    throw new UserMemoryError('WRITE_NOT_AVAILABLE', 'Agent writes are not available in MVP', undefined);
  }

  async delete(_key: string): Promise<boolean> {
    throw new UserMemoryError('WRITE_NOT_AVAILABLE', 'Agent deletes are not available in MVP', undefined);
  }
}

export class UserMemoryError extends Error {
  code: string;
  sessionId?: string;

  constructor(code: string, message: string, sessionId?: string) {
    super(message);
    this.name = 'UserMemoryError';
    this.code = code;
    this.sessionId = sessionId;
  }
}
