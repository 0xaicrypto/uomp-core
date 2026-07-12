import { Command } from 'commander';
import chalk from 'chalk';
import { UompConfig } from '../config.js';
import { AuthService } from '@uomp/auth';
import { JWTTokenIssuer } from '@uomp/token';

export class SessionCommands {
  private static async getAuthService(): Promise<AuthService> {
    const config = new UompConfig();
    await config.init();
    const issuer = new JWTTokenIssuer();
    await issuer.loadOrGenerateKey(config.secretsDir);
    return new AuthService({
      dbPath: config.authDbPath,
      issuer,
    });
  }

  static list(): Command {
    return new Command('list')
      .description('List active sessions')
      .action(async () => {
        const auth = await this.getAuthService();
        try {
          // MVP: query SQLite directly. AuthService could expose a list method.
          const db = (auth as unknown as { db: { prepare: (sql: string) => { all: () => Record<string, string>[] } } }).db;
          const rows = db.prepare("SELECT * FROM sessions WHERE status = 'active' ORDER BY created_at DESC").all();

          if (rows.length === 0) {
            console.log(chalk.gray('No active sessions.'));
            return;
          }

          for (const row of rows) {
            console.log(`${chalk.cyan(row.session_id)} | ${row.agent_id} | expires: ${row.expires_at}`);
          }
        } finally {
          auth.close();
        }
      });
  }

  static revoke(): Command {
    return new Command('revoke')
      .description('Revoke a session')
      .argument('<sessionId>', 'Session ID')
      .action(async (sessionId: string) => {
        const auth = await this.getAuthService();
        try {
          const session = auth.revokeSession(sessionId);
          if (session) {
            console.log(chalk.green(`Revoked session: ${sessionId}`));
          } else {
            console.log(chalk.red('Session not found'));
          }
        } finally {
          auth.close();
        }
      });
  }
}
