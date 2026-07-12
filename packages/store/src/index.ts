import Database from 'better-sqlite3';
import type { MemoryItem, Sensitivity } from '@uomp/core';

export interface StoreOptions {
  dbPath: string;
}

export class MemoryStore {
  private db: Database.Database;

  constructor(options: StoreOptions) {
    this.db = new Database(options.dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_items (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        tags TEXT NOT NULL,
        sensitivity TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        description TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_memory_items_tags ON memory_items(tags);
      CREATE INDEX IF NOT EXISTS idx_memory_items_source ON memory_items(source);
    `);
  }

  get<T = unknown>(key: string): MemoryItem<T> | null {
    const row = this.db.prepare('SELECT * FROM memory_items WHERE key = ?').get(key) as Record<string, string> | undefined;
    return row ? this.deserialize(row) : null;
  }

  getByTag<T = unknown>(tag: string): MemoryItem<T>[] {
    // better-sqlite3 doesn't have native JSON array search; use LIKE for MVP
    const rows = this.db
      .prepare("SELECT * FROM memory_items WHERE ',' || tags || ',' LIKE ?")
      .all(`%,${tag},%`) as Record<string, string>[];
    return rows.map(row => this.deserialize(row));
  }

  getAll<T = unknown>(): MemoryItem<T>[] {
    const rows = this.db.prepare('SELECT * FROM memory_items').all() as Record<string, string>[];
    return rows.map(row => this.deserialize(row));
  }

  set<T = unknown>(item: Omit<MemoryItem<T>, 'createdAt' | 'updatedAt'> & Partial<Pick<MemoryItem<T>, 'createdAt' | 'updatedAt'>>): boolean {
    const now = new Date().toISOString();
    const existing = this.get(item.key);
    const createdAt = existing?.createdAt ?? item.createdAt ?? now;
    const updatedAt = item.updatedAt ?? now;

    const stmt = this.db.prepare(`
      INSERT INTO memory_items (key, value, tags, sensitivity, source, created_at, updated_at, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        tags = excluded.tags,
        sensitivity = excluded.sensitivity,
        source = excluded.source,
        updated_at = excluded.updated_at,
        description = excluded.description
    `);

    stmt.run(
      item.key,
      JSON.stringify(item.value),
      JSON.stringify(item.tags),
      item.sensitivity,
      item.source,
      createdAt,
      updatedAt,
      item.description ?? null
    );

    return true;
  }

  delete(key: string): boolean {
    const result = this.db.prepare('DELETE FROM memory_items WHERE key = ?').run(key);
    return result.changes > 0;
  }

  private deserialize<T>(row: Record<string, string>): MemoryItem<T> {
    return {
      key: row.key,
      value: JSON.parse(row.value) as T,
      tags: JSON.parse(row.tags) as string[],
      sensitivity: row.sensitivity as Sensitivity,
      source: row.source as 'user' | 'agent',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      description: row.description,
    };
  }

  close(): void {
    this.db.close();
  }
}
