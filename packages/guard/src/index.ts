import Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { MemoryItem } from '@uomp/core';
import { generateId } from '@uomp/core';
import { MemoryStore } from '@uomp/store';
import { JWTTokenIssuer, isTokenExpired, type CapabilityTokenPayload } from '@uomp/token';

export interface GuardOptions {
  dbPath: string;
  memoryDbPath: string;
  issuer: JWTTokenIssuer;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  sessionId: string;
  agentId: string;
  action: 'read' | 'write' | 'delete' | 'query';
  key?: string;
  tags?: string[];
  allowed: boolean;
  reason: string;
}

export class MemoryGuard {
  private db: Database.Database;
  private store: MemoryStore;
  private issuer: JWTTokenIssuer;
  private app: Hono;

  constructor(options: GuardOptions) {
    this.db = new Database(options.dbPath);
    this.store = new MemoryStore({ dbPath: options.memoryDbPath });
    this.issuer = options.issuer;
    this.initSchema();
    this.app = this.createApp();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        action TEXT NOT NULL,
        key TEXT,
        tags TEXT,
        allowed INTEGER NOT NULL,
        reason TEXT NOT NULL,
        request_size INTEGER,
        response_size INTEGER,
        query_count_remaining INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_logs(session_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    `);
  }

  getApp(): Hono {
    return this.app;
  }

  private createApp(): Hono {
    const app = new Hono();

    app.get('/v1/memory/:key', async c => {
      const key = c.req.param('key');
      const authHeader = c.req.header('authorization');

      const validation = await this.validateRequest(authHeader);
      if (!validation.valid) {
        this.logAudit({
          sessionId: validation.sessionId ?? 'unknown',
          agentId: validation.agentId ?? 'unknown',
          action: 'read',
          key,
          allowed: false,
          reason: validation.reason,
        });
        return c.json({ error: { code: validation.errorCode, message: validation.reason, session_id: validation.sessionId } }, 403);
      }

      const item = this.store.get(key);
      const allowed = this.isKeyAllowed(key, item, validation.payload!, 'read');

      this.logAudit({
        sessionId: validation.payload!.sessionId,
        agentId: validation.payload!.agentId,
        action: 'read',
        key,
        allowed: allowed.allowed,
        reason: allowed.reason,
      });

      if (!allowed.allowed) {
        return c.json({ error: { code: 'ACCESS_DENIED', message: allowed.reason, session_id: validation.payload!.sessionId } }, 403);
      }

      return c.json(this.serializeItem(item!));
    });

    app.get('/v1/memory', async c => {
      const tag = c.req.query('tag');
      const authHeader = c.req.header('authorization');

      const validation = await this.validateRequest(authHeader);
      if (!validation.valid) {
        this.logAudit({
          sessionId: validation.sessionId ?? 'unknown',
          agentId: validation.agentId ?? 'unknown',
          action: 'read',
          tags: tag ? [tag] : undefined,
          allowed: false,
          reason: validation.reason,
        });
        return c.json({ error: { code: validation.errorCode, message: validation.reason, session_id: validation.sessionId } }, 403);
      }

      if (!tag) {
        return c.json({ error: { code: 'INVALID_REQUEST', message: 'tag query parameter is required' } }, 400);
      }

      const allowed = this.isTagAllowed(tag, validation.payload!, 'read');
      this.logAudit({
        sessionId: validation.payload!.sessionId,
        agentId: validation.payload!.agentId,
        action: 'read',
        tags: [tag],
        allowed: allowed.allowed,
        reason: allowed.reason,
      });

      if (!allowed.allowed) {
        return c.json({ error: { code: 'ACCESS_DENIED', message: allowed.reason, session_id: validation.payload!.sessionId } }, 403);
      }

      const items = this.store.getByTag(tag);
      const filtered = items.filter(item => this.isKeyAllowed(item.key, item, validation.payload!, 'read').allowed);

      return c.json({ items: filtered.map(item => this.serializeItem(item)) });
    });

    app.put('/v1/memory/:key', async c => {
      const key = c.req.param('key');
      const authHeader = c.req.header('authorization');
      const validation = await this.validateRequest(authHeader);

      if (validation.valid) {
        this.logAudit({
          sessionId: validation.payload!.sessionId,
          agentId: validation.payload!.agentId,
          action: 'write',
          key,
          allowed: false,
          reason: 'WRITE_NOT_AVAILABLE_IN_MVP',
        });
      }

      return c.json({ error: { code: 'WRITE_NOT_AVAILABLE', message: 'Agent writes are not available in MVP', session_id: validation.sessionId } }, 503);
    });

    app.delete('/v1/memory/:key', async c => {
      const key = c.req.param('key');
      const authHeader = c.req.header('authorization');
      const validation = await this.validateRequest(authHeader);

      if (validation.valid) {
        this.logAudit({
          sessionId: validation.payload!.sessionId,
          agentId: validation.payload!.agentId,
          action: 'delete',
          key,
          allowed: false,
          reason: 'DELETE_NOT_AVAILABLE_IN_MVP',
        });
      }

      return c.json({ error: { code: 'WRITE_NOT_AVAILABLE', message: 'Agent deletes are not available in MVP', session_id: validation.sessionId } }, 503);
    });

    return app;
  }

  private async validateRequest(authHeader: string | undefined): Promise<
    | { valid: true; payload: CapabilityTokenPayload; sessionId: string; agentId: string }
    | { valid: false; reason: string; errorCode: string; sessionId?: string; agentId?: string }
  > {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { valid: false, reason: 'Missing or invalid Authorization header', errorCode: 'INVALID_TOKEN' };
    }

    const token = authHeader.slice(7);
    try {
      const payload = await this.issuer.verify(token);

      if (isTokenExpired(payload.expiresAt)) {
        return { valid: false, reason: 'Token expired', errorCode: 'TOKEN_EXPIRED', sessionId: payload.sessionId, agentId: payload.agentId };
      }

      return { valid: true, payload, sessionId: payload.sessionId, agentId: payload.agentId };
    } catch (err) {
      return { valid: false, reason: `Token validation failed: ${(err as Error).message}`, errorCode: 'INVALID_TOKEN' };
    }
  }

  private isKeyAllowed(key: string, item: MemoryItem | null, payload: CapabilityTokenPayload, action: 'read' | 'write'): { allowed: boolean; reason: string } {
    const scope = payload.scopes[action];
    if (!scope) {
      return { allowed: false, reason: `No ${action} scope granted` };
    }

    if (scope.denyKeys.includes(key)) {
      return { allowed: false, reason: 'Key explicitly denied' };
    }

    if (scope.keys.includes(key)) {
      if (item && item.sensitivity === 'high' && action === 'read' && !scope.keys.includes(key)) {
        // This path shouldn't happen due to above check, but keep for clarity
      }
      return { allowed: true, reason: 'Key explicitly allowed' };
    }

    if (item && item.sensitivity === 'high') {
      return { allowed: false, reason: 'High sensitivity items require explicit key authorization' };
    }

    const matchedTag = item?.tags.find(tag => scope.tags.includes(tag));
    if (matchedTag && !item?.tags.some(tag => scope.denyTags.includes(tag))) {
      return { allowed: true, reason: `Tag ${matchedTag} allowed` };
    }

    return { allowed: false, reason: 'Key not in authorized scope' };
  }

  private isTagAllowed(tag: string, payload: CapabilityTokenPayload, action: 'read' | 'write'): { allowed: boolean; reason: string } {
    const scope = payload.scopes[action];
    if (!scope) {
      return { allowed: false, reason: `No ${action} scope granted` };
    }

    if (scope.denyTags.includes(tag)) {
      return { allowed: false, reason: 'Tag explicitly denied' };
    }

    if (scope.tags.includes(tag)) {
      return { allowed: true, reason: 'Tag allowed' };
    }

    return { allowed: false, reason: 'Tag not in authorized scope' };
  }

  private serializeItem(item: MemoryItem): Record<string, unknown> {
    return {
      key: item.key,
      value: item.value,
      tags: item.tags,
      sensitivity: item.sensitivity,
      source: item.source,
      updated_at: item.updatedAt,
      description: item.description,
    };
  }

  private logAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    const id = generateId('log');
    const timestamp = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO audit_logs (id, timestamp, session_id, agent_id, action, key, tags, allowed, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      timestamp,
      entry.sessionId,
      entry.agentId,
      entry.action,
      entry.key ?? null,
      entry.tags ? JSON.stringify(entry.tags) : null,
      entry.allowed ? 1 : 0,
      entry.reason
    );
  }

  close(): void {
    this.db.close();
    this.store.close();
  }
}
