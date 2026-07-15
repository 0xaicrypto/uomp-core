#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { UompConfig } from './config.js';
import { MemoryCommands } from './commands/memory.js';
import { RegistryCommands } from './commands/registry.js';
import { RunCommands } from './commands/run.js';
import { SessionsCommands } from './commands/sessions.js';
import { AuditCommands } from './commands/audit.js';
import { AuthorizeCommands } from './commands/authorize.js';
import { DiscoverCommands } from './commands/discover.js';
import { ConnectCommands } from './commands/connect.js';
import { ImportCommands } from './commands/import.js';
import { GatewayCommands } from './commands/gateway.js';

const program = new Command();

program
  .name('uomp')
  .description('User-Owned Memory Protocol CLI')
  .version('0.0.1');

program
  .command('init')
  .description('Initialize UOMP data directory')
  .action(async () => {
    const config = new UompConfig();
    await config.init();
    console.log(chalk.green(`UOMP initialized at ${config.dataDir}`));
  });

program
  .command('memory')
  .description('Manage memory items')
  .addCommand(MemoryCommands.add())
  .addCommand(MemoryCommands.list())
  .addCommand(MemoryCommands.get())
  .addCommand(MemoryCommands.deleteCmd())
  .addCommand(MemoryCommands.importCmd());

// New generic import command (supersedes memory import for external data)
program.addCommand(ImportCommands.get());

program
  .command('registry')
  .description('Agent registry operations')
  .addCommand(RegistryCommands.search())
  .addCommand(RegistryCommands.list())
  .addCommand(RegistryCommands.add())
  .addCommand(RegistryCommands.remove())
  .addCommand(RegistryCommands.install());

program
  .command('discover <agent>')
  .description('Discover an agent from a local path or registry://<id>')
  .action(async (agent: string) => {
    const config = new UompConfig();
    await config.init();
    const discover = new DiscoverCommands(config);
    await discover.discover(agent);
  });

program
  .command('connect <agent>')
  .description('Connect to an agent: verify identity, checksum, and cache manifest')
  .action(async (agent: string) => {
    const config = new UompConfig();
    await config.init();
    const connect = new ConnectCommands(config);
    await connect.connect(agent);
  });

program
  .command('authorize <agent>')
  .description('Authorize an agent and output the capability token')
  .option('-s, --scope <scopes...>', 'Additional read scopes (tags)')
  .option('-o, --output <file>', 'Save token environment variables to file')
  .option('-d, --duration <minutes>', 'Session duration in minutes', '30')
  .option('--no-server', 'Do not start the local Auth + Guard server')
  .action(async (agent: string, options: { scope?: string[]; output?: string; duration?: string; server?: boolean }) => {
    const config = new UompConfig();
    await config.init();
    const authorizer = new AuthorizeCommands(config);
    await authorizer.authorize(agent, options);
  });

program
  .command('sessions')
  .description('List active sessions')
  .option('-a, --all', 'Include closed sessions')
  .action(async (options: { all?: boolean }) => {
    // Reuse the list command action manually
    const cmd = SessionsCommands.list();
    await cmd.parseAsync(['node', 'uomp', ...(options.all ? ['--all'] : [])]);
  });

program
  .command('revoke <sessionId>')
  .description('Revoke a session')
  .action(async (sessionId: string) => {
    const cmd = SessionsCommands.revoke();
    await cmd.parseAsync(['node', 'uomp', sessionId]);
  });

program
  .command('audit')
  .description('View audit logs')
  .option('-s, --session <sessionId>', 'Filter by session ID')
  .option('-a, --agent <agentId>', 'Filter by agent ID')
  .option('-l, --limit <number>', 'Limit number of results', '50')
  .action(async (options: { session?: string; agent?: string; limit?: string }) => {
    const cmd = AuditCommands.list();
    await cmd.parseAsync([
      'node',
      'uomp',
      ...(options.session ? ['--session', options.session] : []),
      ...(options.agent ? ['--agent', options.agent] : []),
      ...(options.limit ? ['--limit', options.limit] : []),
    ]);
  });

program
  .command('agent')
  .description('Agent developer commands')
  .addCommand(new Command('run')
    .description('Run an agent as a child process (developer shortcut)')
    .argument('<agent>', 'Agent path')
    .option('-s, --scope <scopes...>', 'Additional read scopes')
    .action(async (agent: string, options: { scope?: string[] }) => {
      const config = new UompConfig();
      await config.init();
      const runner = new RunCommands(config);
      await runner.run(agent, options.scope ?? []);
    }));

program
  .command('gateway')
  .description('Gateway management')
  .addCommand(GatewayCommands.start())
  .addCommand(GatewayCommands.status());

program.parse();
