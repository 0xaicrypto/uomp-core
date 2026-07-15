import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import https from 'https';
import type { IncomingMessage } from 'http';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';
import { JWTTokenIssuer, type CapabilityTokenPayload } from '@uomp/token';
import { PUBLIC_KEY_FILE_NAME } from '@uomp/core';
import type { JWK } from 'jose';
import { join } from 'path';
import { homedir } from 'os';

interface GatewayConfig {
  port: number;
  host: string;
  guardUrl: string;
  dataDir: string;
  certPath: string;
  keyPath: string;
  caPath: string;
  audience: string;
  requireMtls: boolean;
  agentAllowlist: string[];
}

interface RemoteProfile {
  profile: 'remote';
  gateway?: {
    endpoint?: string;
    tls?: { mtls_required?: boolean };
    agent_allowlist?: string[];
  };
  audit?: { anchor_chain?: string };
}

type Bindings = {
  incoming: IncomingMessage;
};

declare module 'hono' {
  interface ContextVariableMap {
    tokenPayload: CapabilityTokenPayload;
    clientFingerprint?: string;
  }
}

async function loadConfig(): Promise<GatewayConfig> {
  const dataDir = process.env.UOMP_DATA_DIR ?? join(homedir(), '.uomp');
  const certDir = join(dataDir, '.gateway-certs');
  const profilePath = process.env.UOMP_REMOTE_PROFILE ?? join(dataDir, 'remote-profile.json');

  let profile: RemoteProfile | undefined;
  try {
    if (existsSync(profilePath)) {
      profile = JSON.parse(await readFile(profilePath, 'utf-8')) as RemoteProfile;
    }
  } catch {
    // ignore
  }

  const audience = process.env.UOMP_GATEWAY_AUDIENCE
    ?? profile?.gateway?.endpoint
    ?? `https://localhost:${process.env.UOMP_GATEWAY_PORT ?? '9443'}`;

  return {
    port: parseInt(process.env.UOMP_GATEWAY_PORT ?? '9443', 10),
    host: process.env.UOMP_GATEWAY_HOST ?? '0.0.0.0',
    guardUrl: process.env.UOMP_GUARD_URL ?? 'http://127.0.0.1:9374',
    dataDir,
    certPath: process.env.UOMP_GATEWAY_CERT ?? join(certDir, 'gateway.crt'),
    keyPath: process.env.UOMP_GATEWAY_KEY ?? join(certDir, 'gateway.key'),
    caPath: process.env.UOMP_GATEWAY_CA ?? join(certDir, 'ca.crt'),
    audience,
    requireMtls: profile?.gateway?.tls?.mtls_required ?? true,
    agentAllowlist: profile?.gateway?.agent_allowlist ?? [],
  };
}

async function loadPublicKey(secretsDir: string): Promise<JWTTokenIssuer> {
  const publicPath = join(secretsDir, PUBLIC_KEY_FILE_NAME);
  const content = await readFile(publicPath, 'utf-8');
  const jwk = JSON.parse(content) as JWK;
  const issuer = new JWTTokenIssuer();
  await issuer.importKey(jwk);
  return issuer;
}

function matchesAllowedEndpoint(path: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some(pattern => {
    if (pattern.endsWith('*')) {
      return path.startsWith(pattern.slice(0, -1));
    }
    return path === pattern;
  });
}

async function forwardToGuard(c: any, config: GatewayConfig): Promise<Response> {
  const payload = c.get('tokenPayload') as CapabilityTokenPayload;
  const target = new URL(c.req.path, config.guardUrl);
  target.search = new URL(c.req.url).search;

  const headers: Record<string, string> = {
    authorization: c.req.header('authorization') ?? '',
    'x-uomp-agent-id': payload.agentId,
  };

  const body = ['GET', 'HEAD'].includes(c.req.method) ? undefined : await c.req.arrayBuffer();

  const upstream = await fetch(target.toString(), {
    method: c.req.method,
    headers,
    body,
  });

  const responseBody = await upstream.arrayBuffer();
  return c.newResponse(responseBody, upstream.status as any, Object.fromEntries(upstream.headers.entries()));
}

function getPeerFingerprint(req: IncomingMessage): string | undefined {
  const socket = req.socket as { getPeerCertificate?: () => { fingerprint256?: string } };
  const cert = socket.getPeerCertificate?.();
  return cert?.fingerprint256;
}

async function main() {
  const config = await loadConfig();
  const secretsDir = join(config.dataDir, '.secrets');

  if (!existsSync(config.certPath) || !existsSync(config.keyPath)) {
    console.error(`Gateway TLS certificate not found at ${config.certPath}`);
    console.error('Generate certs first, e.g.: scripts/generate-gateway-certs.sh');
    process.exit(1);
  }

  const [cert, key, ca] = await Promise.all([
    readFile(config.certPath),
    readFile(config.keyPath),
    readFile(config.caPath).catch(() => undefined),
  ]);

  const issuer = await loadPublicKey(secretsDir).catch(err => {
    console.error('Failed to load Auth Service public key:', err.message);
    process.exit(1);
  });

  const app = new Hono<{ Bindings: Bindings }>();

  app.get('/v1/health', c => c.json({ status: 'ok', audience: config.audience }));

  // Token validation middleware
  app.use('/v1/*', async (c, next) => {
    if (c.req.path === '/v1/health') return next();

    const authHeader = c.req.header('authorization');
    const agentId = c.req.header('x-uomp-agent-id');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: { code: 'INVALID_TOKEN', message: 'Missing Authorization header' } }, 401);
    }

    const token = authHeader.slice(7);
    let payload: CapabilityTokenPayload;
    try {
      payload = await issuer.verify(token);
    } catch (err) {
      return c.json({ error: { code: 'INVALID_TOKEN', message: `Token verification failed: ${(err as Error).message}` } }, 401);
    }

    if (payload.profile !== 'remote') {
      return c.json({ error: { code: 'INVALID_PROFILE', message: 'Token profile is not remote' } }, 403);
    }

    if (payload.audience && payload.audience !== config.audience) {
      return c.json({ error: { code: 'AUDIENCE_MISMATCH', message: 'Token audience does not match this Gateway' } }, 403);
    }

    if (!matchesAllowedEndpoint(c.req.path, payload.allowedEndpoints)) {
      return c.json({ error: { code: 'ENDPOINT_NOT_ALLOWED', message: 'Request path not allowed by token' } }, 403);
    }

    if (agentId && agentId !== payload.agentId) {
      return c.json({ error: { code: 'AGENT_MISMATCH', message: 'X-UOMP-Agent-Id does not match token' } }, 403);
    }

    // mTLS allowlist check
    if (config.requireMtls) {
      const fingerprint = getPeerFingerprint(c.env.incoming);
      if (!fingerprint) {
        return c.json({ error: { code: 'MTLS_REQUIRED', message: 'Client certificate required' } }, 401);
      }
      if (config.agentAllowlist.length > 0 && !config.agentAllowlist.includes(fingerprint)) {
        return c.json({ error: { code: 'CERT_NOT_ALLOWED', message: 'Client certificate not in allowlist' } }, 403);
      }
      c.set('clientFingerprint', fingerprint);
    }

    c.set('tokenPayload', payload);
    return next();
  });

  // Forward memory and audit requests to local Memory Guard
  app.all('/v1/memory/*', async c => forwardToGuard(c, config));
  app.all('/v1/audit/*', async c => forwardToGuard(c, config));

  // Payload upload / download (Phase 2: simple in-memory cache)
  const payloadCache = new Map<string, { data: ArrayBuffer; meta: Record<string, unknown> }>();

  app.post('/v1/payload/upload', async c => {
    const payload = c.get('tokenPayload');
    const id = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const data = await c.req.arrayBuffer();
    payloadCache.set(id, { data, meta: { sessionId: payload.sessionId, agentId: payload.agentId, uploadedAt: new Date().toISOString() } });
    return c.json({ payload_id: id, size: data.byteLength });
  });

  app.get('/v1/payload/:id', async c => {
    const id = c.req.param('id');
    const cached = payloadCache.get(id);
    if (!cached) return c.json({ error: { code: 'NOT_FOUND', message: 'Payload not found' } }, 404);
    return c.newResponse(cached.data, 200, { 'content-type': 'application/octet-stream' });
  });

  app.post('/v1/sessions/:id/refresh', async c => {
    return c.json({ error: { code: 'NOT_IMPLEMENTED', message: 'Token refresh is not yet implemented' } }, 501);
  });

  const listener = getRequestListener(app.fetch);

  const server = https.createServer(
    {
      cert,
      key,
      ca,
      requestCert: config.requireMtls,
      rejectUnauthorized: false, // we verify manually against allowlist
    },
    listener,
  );

  server.listen(config.port, config.host, () => {
    console.log(`UOMP Gateway listening on https://${config.host}:${config.port}`);
    console.log(`Forwarding memory requests to ${config.guardUrl}`);
    console.log(`mTLS required: ${config.requireMtls}`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
