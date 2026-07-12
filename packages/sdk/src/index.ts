import type { MemoryItem } from '@uomp/core';

export interface UserMemoryClientOptions {
  baseUrl?: string;
  token: string;
  timeoutMs?: number;
}

export class UserMemory {
  private baseUrl: string;
  private token: string;
  private timeoutMs: number;

  constructor(options: UserMemoryClientOptions) {
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:9374').replace(/\/$/, '');
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  async get<T = unknown>(key: string): Promise<MemoryItem<T> | null> {
    const response = await this.fetch(`/v1/memory/${encodeURIComponent(key)}`);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const error = await this.parseError(response);
      throw new UserMemoryError(error.code, error.message, error.session_id);
    }

    return (await response.json()) as MemoryItem<T>;
  }

  async getByTag<T = unknown>(tag: string): Promise<MemoryItem<T>[]> {
    const response = await this.fetch(`/v1/memory?tag=${encodeURIComponent(tag)}`);

    if (!response.ok) {
      const error = await this.parseError(response);
      throw new UserMemoryError(error.code, error.message, error.session_id);
    }

    const data = (await response.json()) as { items: MemoryItem<T>[] };
    return data.items;
  }

  async set<T = unknown>(_key: string, _value: T): Promise<boolean> {
    throw new UserMemoryError('WRITE_NOT_AVAILABLE', 'Agent writes are not available in MVP', undefined);
  }

  async delete(_key: string): Promise<boolean> {
    throw new UserMemoryError('WRITE_NOT_AVAILABLE', 'Agent deletes are not available in MVP', undefined);
  }

  private async fetch(path: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseError(response: Response): Promise<{ code: string; message: string; session_id?: string }> {
    try {
      const data = (await response.json()) as { error: { code: string; message: string; session_id?: string } };
      return data.error;
    } catch {
      return { code: 'UNKNOWN_ERROR', message: `HTTP ${response.status}` };
    }
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
