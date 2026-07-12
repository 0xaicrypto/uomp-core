import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { UompConfig } from '../config.js';
import { AuthService } from '@uomp/auth';
import { JWTTokenIssuer } from '@uomp/token';
import { IdentityVerifier } from '@uomp/identity';
import type { AgentManifest, Scopes } from '@uomp/core';

export class AuthorizeCommands {
  private config: UompConfig;
  private issuer: JWTTokenIssuer;
  private authService: AuthService;

  constructor(config: UompConfig) {
    this.config = config;
    this.issuer = new JWTTokenIssuer();
    this.authService = new AuthService({
      dbPath: config.authDbPath,
      issuer: this.issuer,
    });
  }

  async ensureKeyPair(): Promise<void> {
    await this.issuer.loadOrGenerateKey(this.config.secretsDir);
  }

  async authorize(agentPath: string, additionalScopes: string[]): Promise<void> {
    await this.ensureKeyPair();

    const resolvedPath = resolve(agentPath);
    const manifest = await this.loadManifest(resolvedPath);

    if (!manifest) {
      console.log(chalk.red(`Could not find uom.json in ${resolvedPath}`));
      return;
    }

    // Verify identity
    const verifier = new IdentityVerifier();
    const verification = await verifier.verifyManifest(manifest);
    if (!verification.valid) {
      console.log(chalk.yellow(`Identity verification warning: ${verification.error}`));
    } else {
      console.log(chalk.green(`Identity verified via ${verification.method}`));
    }

    // Show authorization panel
    const grantedScopes = await this.promptForScopes(manifest, additionalScopes);

    // Create session
    const session = this.authService.createSession({
      agent_id: manifest.agent.id,
      agent_name: manifest.agent.name,
      requested_scopes: manifest.requestedScopes,
      duration_minutes: 30,
    });

    const grant = await this.authService.grantSession(session.sessionId, grantedScopes);
    if (!grant) {
      console.log(chalk.red('Failed to grant session'));
      return;
    }

    console.log(chalk.green(`Session granted: ${session.sessionId}`));
    console.log(chalk.gray(`Token expires at: ${grant.expiresAt}`));
    console.log('');
    console.log(chalk.cyan('Set the following environment variables in the Agent process:'));
    console.log(`  export UOM_TOKEN="${grant.token}"`);
    console.log(`  export UOMP_BASE_URL="${this.config.serverUrl}"`);
    console.log('');
    console.log(chalk.gray('Then start the Agent independently. For local development, you can also use:'));
    console.log(chalk.gray(`  pnpm cli run ${agentPath}`));

    this.authService.close();
  }

  private async loadManifest(agentPath: string): Promise<AgentManifest | null> {
    try {
      const content = await readFile(join(agentPath, 'uom.json'), 'utf-8');
      const raw = JSON.parse(content) as Record<string, unknown>;
      return this.normalizeManifest(raw);
    } catch {
      return null;
    }
  }

  private normalizeManifest(raw: Record<string, unknown>): AgentManifest {
    const scopeAction = (rawAction: Record<string, unknown>) => ({
      tags: (rawAction.tags as string[]) ?? [],
      keys: (rawAction.keys as string[]) ?? [],
      denyTags: (rawAction.deny_tags as string[]) ?? [],
      denyKeys: (rawAction.deny_keys as string[]) ?? [],
    });

    const rawScopes = (raw.requested_scopes as Record<string, Record<string, unknown>>) ?? {};
    const rawAgent = (raw.agent as Record<string, unknown>) ?? {};
    const rawIdentity = (raw.identity as Record<string, unknown>) ?? undefined;

    return {
      uompVersion: String(raw.uomp_version ?? '1.0'),
      agent: {
        id: String(rawAgent.id ?? ''),
        name: String(rawAgent.name ?? ''),
        version: String(rawAgent.version ?? ''),
        description: rawAgent.description as string | undefined,
        publisher: rawAgent.publisher as string | undefined,
      },
      requestedScopes: {
        read: scopeAction(rawScopes.read ?? {}),
        write: scopeAction(rawScopes.write ?? {}),
      },
      requiredCapabilities: raw.required_capabilities as string[] | undefined,
      optionalCapabilities: raw.optional_capabilities as string[] | undefined,
      requiresRemote: Boolean(raw.requires_remote),
      identity: rawIdentity
        ? {
            did: rawIdentity.did as string | undefined,
            verificationMethods: rawIdentity.verification_methods as string[] | undefined,
            proof: rawIdentity.proof
              ? {
                  type: String((rawIdentity.proof as Record<string, unknown>).type ?? ''),
                  created: String((rawIdentity.proof as Record<string, unknown>).created ?? ''),
                  proofValue: String((rawIdentity.proof as Record<string, unknown>).proofValue ?? ''),
                }
              : undefined,
          }
        : undefined,
    };
  }

  private async promptForScopes(manifest: AgentManifest, additionalScopes: string[]): Promise<Scopes> {
    const readTags = [
      ...new Set([
        ...(manifest.requestedScopes.read.tags ?? []),
        ...additionalScopes,
      ]),
    ];

    if (readTags.length === 0) {
      return {
        read: { tags: [], keys: [], denyTags: [], denyKeys: [] },
        write: { tags: [], keys: [], denyTags: [], denyKeys: [] },
      };
    }

    const { selectedTags } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedTags',
        message: 'Select tags to authorize for reading:',
        choices: readTags,
        default: manifest.requestedScopes.read.tags,
      },
    ]);

    return {
      read: {
        tags: selectedTags as string[],
        keys: manifest.requestedScopes.read.keys ?? [],
        denyTags: manifest.requestedScopes.read.denyTags ?? [],
        denyKeys: manifest.requestedScopes.read.denyKeys ?? [],
      },
      write: {
        tags: [],
        keys: [],
        denyTags: [],
        denyKeys: [],
      },
    };
  }
}
