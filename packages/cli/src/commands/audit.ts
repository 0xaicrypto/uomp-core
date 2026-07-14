import { Command } from 'commander';
import chalk from 'chalk';
import { UompConfig } from '../config.js';
import { MemoryGuard } from '@uomp/guard';
import { JWTTokenIssuer } from '@uomp/token';

export class AuditCommands {
  private static async getGuard(): Promise<MemoryGuard> {
    const config = new UompConfig();
    await config.init();
    const issuer = new JWTTokenIssuer();
    await issuer.loadOrGenerateKey(config.secretsDir);
    return new MemoryGuard({ dbPath: config.auditDbPath, memoryDbPath: config.memoryDbPath, issuer });
  }

  static list(): Command {
    return new Command('list')
      .description('List audit logs')
      .option('-s, --session <sessionId>', 'Filter by session ID')
      .option('-a, --agent <agentId>', 'Filter by agent ID')
      .option('-l, --limit <number>', 'Limit number of results', '50')
      .action(async (options: { session?: string; agent?: string; limit?: string }) => {
        const guard = await this.getGuard();
        try {
          const logs = guard.getAuditLogs({
            sessionId: options.session,
            agentId: options.agent,
            limit: options.limit ? parseInt(options.limit, 10) : 50,
          });

          if (logs.length === 0) {
            console.log(chalk.gray('No audit logs found.'));
            return;
          }

          console.log(chalk.bold('Audit logs:'));
          for (const log of logs) {
            const allowedLabel = log.allowed ? chalk.green('allowed') : chalk.red('denied');
            const target = log.key ?? (log.tags ? log.tags.join(',') : '-');
            console.log(`${log.timestamp} | ${log.sessionId} | ${log.agentId} | ${log.action} ${target} | ${allowedLabel} | ${log.reason}`);
          }
        } finally {
          guard.close();
        }
      });
  }
}
