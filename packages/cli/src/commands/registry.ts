import { Command } from 'commander';
import chalk from 'chalk';
import { UompConfig } from '../config.js';
import { ERC8004RegistryClient } from '@uomp/registry';

export class RegistryCommands {
  private static getClient(): ERC8004RegistryClient {
    return new ERC8004RegistryClient({ endpoint: 'https://registry.uomp.org' });
  }

  static search(): Command {
    return new Command('search')
      .description('Search for agents in registry')
      .argument('<keyword>', 'Search keyword')
      .action(async (keyword: string) => {
        const client = this.getClient();
        const results = await client.search(keyword);

        if (results.length === 0) {
          console.log(chalk.gray('No agents found.'));
          return;
        }

        for (const agent of results) {
          const verified = agent.verified ? chalk.green('✓ verified') : chalk.yellow('unverified');
          console.log(`${chalk.cyan(agent.agentId)} ${verified}`);
          console.log(`  ${agent.name} v${agent.version}`);
          if (agent.description) console.log(`  ${agent.description}`);
        }
      });
  }

  static install(): Command {
    return new Command('install')
      .description('Install an agent from registry')
      .argument('<agentId>', 'Agent ID')
      .action(async (agentId: string) => {
        const config = new UompConfig();
        await config.init();
        const client = this.getClient();
        const dir = await client.install(agentId, config.agentsDir);
        console.log(chalk.green(`Installed ${agentId} to ${dir}`));
      });
  }
}
