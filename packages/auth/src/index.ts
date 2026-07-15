import Database from 'better-sqlite3';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Scopes } from '@uomp/core';
import { generateId } from '@uomp/core';
import { JWTTokenIssuer, type CapabilityTokenPayload } from '@uomp/token';

export interface Session {
  sessionId: string;
  agentId: string;
  agentName?: string;
  status: 'created' | 'active' | 'closed' | 'expired' | 'revoked';
  createdAt: string;
  expiresAt: string;
  closedAt?: string;
  grantedScopes?: Scopes;
  requestedScopes: Scopes;
  tokenHash?: string;
}

export interface AuthServiceOptions {
  dbPath: string;
  issuer: JWTTokenIssuer;
  defaultDurationMinutes?: number;
}

const createSessionSchema = z.object({
  agent_id: z.string(),
  agent_name: z.string().optional(),
  requested_scopes: z.custom<Scopes>(),
  duration_minutes: z.number().min(1).max(1440).default(30),
});

const grantSessionSchema = z.object({
  granted_scopes: z.custom<Scopes>(),
  profile: z.string().optional(),
  audience: z.string().optional(),
  allowed_fields: z.array(z.string()).optional(),
  aggregation_only: z.boolean().optional(),
  task_bound: z.boolean().optional(),
});

const deletionProofSchema = z.object({
  deletion_proof_id: z.string(),
  session_id: z.string(),
  agent_id: z.string(),
  deleted_at: z.string(),
  memory_hash: z.string(),
  fields_accessed: z.array(z.string()).optional(),
  method: z.string(),
  proof_value: z.string(),
});

export class AuthService {
  private db: Database.Database;
  private issuer: JWTTokenIssuer;
  private defaultDurationMinutes: number;
  private app: Hono;

  constructor(options: AuthServiceOptions) {
    this.db = new Database(options.dbPath);
    this.issuer = options.issuer;
    this.defaultDurationMinutes = options.defaultDurationMinutes ?? 30;
    this.initSchema();
    this.app = this.createApp();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        agent_name TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        closed_at TEXT,
        requested_scopes TEXT NOT NULL,
        granted_scopes TEXT,
        token_hash TEXT
      );

      CREATE TABLE IF NOT EXISTS token_blacklist (
        token_hash TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `);
  }

  getApp(): Hono {
    return this.app;
  }

  private createApp(): Hono {
    const app = new Hono();

    app.post('/v1/sessions', async c => {
      const body = await c.req.json();
      const parsed = createSessionSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: { code: 'INVALID_REQUEST', message: parsed.error.message } }, 400);
      }

      const session = this.createSession(parsed.data);
      return c.json({
        session_id: session.sessionId,
        status: session.status,
        agent_id: session.agentId,
        requested_scopes: session.requestedScopes,
        expires_at: session.expiresAt,
      });
    });

    app.post('/v1/sessions/:id/grant', async c => {
      const sessionId = c.req.param('id');
      const body = await c.req.json();
      const parsed = grantSessionSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: { code: 'INVALID_REQUEST', message: parsed.error.message } }, 400);
      }

      const result = await this.grantSession(sessionId, parsed.data.granted_scopes, {
        profile: parsed.data.profile,
        audience: parsed.data.audience,
        allowedFields: parsed.data.allowed_fields,
        aggregationOnly: parsed.data.aggregation_only,
        taskBound: parsed.data.task_bound,
      });
      if (!result) {
        return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found or not in created state' } }, 404);
      }

      return c.json({
        token: result.token,
        token_type: 'Bearer',
        expires_at: result.expiresAt,
      });
    });

    app.post('/v1/sessions/:id/close', c => {
      const sessionId = c.req.param('id');
      const session = this.closeSession(sessionId);
      if (!session) {
        return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404);
      }
      return c.json({ session_id: session.sessionId, status: session.status });
    });

    app.post('/v1/sessions/:id/revoke', c => {
      const sessionId = c.req.param('id');
      const session = this.revokeSession(sessionId);
      if (!session) {
        return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404);
      }
      return c.json({ session_id: session.sessionId, status: session.status });
    });

    app.post('/v1/tokens/validate', async c => {
      const body = await c.req.json();
      const token = body.token as string;
      try {
        const payload = await this.issuer.verify(token);
        const isBlacklisted = this.isTokenBlacklisted(payload.sessionId);
        return c.json({
          valid: !isBlacklisted,
          session_id: payload.sessionId,
          expires_at: payload.expiresAt,
        });
      } catch {
        return c.json({ valid: false }, 400);
      }
    });

    app.post('/v1/sessions/:id/deletion-proof', async c => {
      const sessionId = c.req.param('id');
      const body = await c.req.json();
      const parsed = deletionProofSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: { code: 'INVALID_REQUEST', message: parsed.error.message } }, 400);
      }

      const proof = parsed.data;
      if (proof.session_id !== sessionId) {
        return c.json({ error: { code: 'INVALID_REQUEST', message: 'session_id mismatch' } }, 400);
      }

      const row = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId) as Record<string, string> | undefined;
      if (!row) {
        return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404);
      }

      // Close the session if task_bound (or always close on deletion proof)
      this.db.prepare(`
        UPDATE sessions SET status = 'closed', closed_at = ?
        WHERE session_id = ? AND status = 'active'
      `).run(new Date().toISOString(), sessionId);

      return c.json({ status: 'accepted', deletion_proof_id: proof.deletion_proof_id });
    });

    return app;
  }

  createSession(data: z.infer<typeof createSessionSchema>): Session {
    const sessionId = generateId('sess');
    const now = new Date();
    const duration = data.duration_minutes ?? this.defaultDurationMinutes;
    const expiresAt = new Date(now.getTime() + duration * 60 * 1000);

    const session: Session = {
      sessionId,
      agentId: data.agent_id,
      agentName: data.agent_name,
      status: 'created',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      requestedScopes: data.requested_scopes,
    };

    const stmt = this.db.prepare(`
      INSERT INTO sessions (session_id, agent_id, agent_name, status, created_at, expires_at, requested_scopes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.sessionId,
      session.agentId,
      session.agentName ?? null,
      session.status,
      session.createdAt,
      session.expiresAt,
      JSON.stringify(session.requestedScopes)
    );

    return session;
  }

  async grantSession(
    sessionId: string,
    grantedScopes: Scopes,
    options?: { profile?: string; audience?: string; allowedFields?: string[]; aggregationOnly?: boolean; taskBound?: boolean }
  ): Promise<{ token: string; expiresAt: string } | null> {
    const row = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId) as Record<string, string> | undefined;
    if (!row || row.status !== 'created') {
      return null;
    }

    const expiresAt = new Date(row.expires_at);
    const profile = options?.profile ?? 'local';
    const audience = options?.audience ?? (profile === 'remote' ? undefined : `http://127.0.0.1:9374`);
    const payload: CapabilityTokenPayload = {
      version: '1.0',
      sessionId,
      agentId: row.agent_id,
      issuedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      scopes: grantedScopes,
      profile,
      audience,
      limits: { maxReadQueries: 100, maxWriteQueries: 0 },
      allowedFields: options?.allowedFields,
      aggregationOnly: options?.aggregationOnly ?? false,
      taskBound: options?.taskBound ?? false,
    };

    const token = await this.issuer.issue(payload);
    const tokenHash = this.hashToken(token);

    this.db.prepare(`
      UPDATE sessions SET status = 'active', granted_scopes = ?, token_hash = ?
      WHERE session_id = ?
    `).run(JSON.stringify(grantedScopes), tokenHash, sessionId);

    return { token, expiresAt: expiresAt.toISOString() };
  }

  closeSession(sessionId: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId) as Record<string, string> | undefined;
    if (!row) return null;

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE sessions SET status = 'closed', closed_at = ? WHERE session_id = ?
    `).run(now, sessionId);

    if (row.token_hash) {
      this.blacklistToken(row.token_hash, sessionId, row.expires_at);
    }

    return this.deserializeSession(row, 'closed');
  }

  revokeSession(sessionId: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId) as Record<string, string> | undefined;
    if (!row) return null;

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE sessions SET status = 'revoked', closed_at = ? WHERE session_id = ?
    `).run(now, sessionId);

    if (row.token_hash) {
      this.blacklistToken(row.token_hash, sessionId, row.expires_at);
    }

    return this.deserializeSession(row, 'revoked');
  }

  getSession(sessionId: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId) as Record<string, string> | undefined;
    return row ? this.deserializeSession(row) : null;
  }

  isTokenBlacklisted(sessionId: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM token_blacklist WHERE session_id = ?').get(sessionId);
    return !!row;
  }

  private blacklistToken(tokenHash: string, sessionId: string, expiresAt: string): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO token_blacklist (token_hash, session_id, expires_at)
      VALUES (?, ?, ?)
    `).run(tokenHash, sessionId, expiresAt);
  }

  private hashToken(token: string): string {
    // Simple hash for MVP. In production use crypto.subtle.digest.
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private deserializeSession(row: Record<string, string>, overrideStatus?: string): Session {
    return {
      sessionId: row.session_id,
      agentId: row.agent_id,
      agentName: row.agent_name,
      status: (overrideStatus ?? row.status) as Session['status'],
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      closedAt: row.closed_at,
      requestedScopes: JSON.parse(row.requested_scopes) as Scopes,
      grantedScopes: row.granted_scopes ? (JSON.parse(row.granted_scopes) as Scopes) : undefined,
      tokenHash: row.token_hash,
    };
  }

  close(): void {
    this.db.close();
  }
}
