#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { UompConfig } from './config.js';
import { MemoryCommands } from './commands/memory.js';
import { RegistryCommands } from './commands/registry.js';
import { RunCommands } from './commands/run.js';
import { SessionCommands } from './commands/session.js';
import { AuthorizeCommands } from './commands/authorize.js';

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

program
  .command('registry')
  .description('Agent registry operations')
  .addCommand(RegistryCommands.search())
  .addCommand(RegistryCommands.install());

program
  .command('authorize <agent>')
  .description('Authorize an agent and print the capability token (standard mode: agent runs independently)')
  .option('-s, --scope <scopes...>', 'Additional read scopes (tags)')
  .action(async (agent: string, options: { scope?: string[] }) => {
    const config = new UompConfig();
    await config.init();
    const authorizer = new AuthorizeCommands(config);
    await authorizer.authorize(agent, options.scope ?? []);
  });

program
  .command('run <agent>')
  .description('Run an agent as a child process with authorization (local development shortcut)')
  .option('-s, --scope <scopes...>', 'Additional read scopes (tags)')
  .action(async (agent: string, options: { scope?: string[] }) => {
    const config = new UompConfig();
    await config.init();
    const runner = new RunCommands(config);
    await runner.run(agent, options.scope ?? []);
  });

program
  .command('session')
  .description('Manage active sessions')
  .addCommand(SessionCommands.list())
  .addCommand(SessionCommands.revoke());

program.parse();
