import { serve } from '@hono/node-server';
import { mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { DEFAULT_HOST, DEFAULT_PORT, DATA_DIR_NAME } from '@uomp/core';
import { AuthService } from '@uomp/auth';
import { MemoryGuard } from '@uomp/guard';
import { JWTTokenIssuer } from '@uomp/token';

async function main() {
  const dataDir = join(homedir(), DATA_DIR_NAME);
  await mkdir(dataDir, { recursive: true });

  const issuer = new JWTTokenIssuer();
  await issuer.generateKey();

  const authDbPath = join(dataDir, 'auth.db');
  const auditDbPath = join(dataDir, 'audit.db');
  const memoryDbPath = join(dataDir, 'memory.db');

  const authService = new AuthService({
    dbPath: authDbPath,
    issuer,
  });

  const guard = new MemoryGuard({
    dbPath: auditDbPath,
    memoryDbPath,
    issuer,
  });

  const authApp = authService.getApp();
  const guardApp = guard.getApp();

  // Combine both apps
  const app = authApp;
  app.route('/', guardApp);

  const host = process.env.UOMP_HOST ?? DEFAULT_HOST;
  const port = Number(process.env.UOMP_PORT ?? DEFAULT_PORT);

  console.log(`UOMP server starting on http://${host}:${port}`);

  serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
