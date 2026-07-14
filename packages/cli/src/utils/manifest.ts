import { readFile } from 'fs/promises';
import { join } from 'path';
import type { AgentManifest } from '@uomp/core';

export interface RawScopeAction {
  tags?: string[];
  keys?: string[];
  deny_tags?: string[];
  deny_keys?: string[];
  fields?: Record<string, string[]>;
  purposes?: Record<string, string>;
}

export interface RawAgentManifest {
  uomp_version?: string;
  agent?: {
    id?: string;
    name?: string;
    version?: string;
    description?: string;
    publisher?: string;
  };
  requested_scopes?: {
    read?: RawScopeAction;
    write?: RawScopeAction;
  };
  required_capabilities?: string[];
  optional_capabilities?: string[];
  requires_remote?: boolean;
  identity?: {
    did?: string;
    verification_methods?: string[];
    proof?: {
      type?: string;
      created?: string;
      proofValue?: string;
    };
  };
  package?: {
    checksum?: string;
    signature?: string;
    source_url?: string;
  };
  external_data_sources?: string[];
}

export function normalizeManifest(raw: RawAgentManifest): AgentManifest {
  const scopeAction = (rawAction?: RawScopeAction) => ({
    tags: rawAction?.tags ?? [],
    keys: rawAction?.keys ?? [],
    denyTags: rawAction?.deny_tags ?? [],
    denyKeys: rawAction?.deny_keys ?? [],
    fields: rawAction?.fields,
    purposes: rawAction?.purposes,
  });

  const rawScopes = raw.requested_scopes ?? {};
  const rawAgent = raw.agent ?? {};

  return {
    uompVersion: String(raw.uomp_version ?? '1.0'),
    agent: {
      id: String(rawAgent.id ?? ''),
      name: String(rawAgent.name ?? ''),
      version: String(rawAgent.version ?? ''),
      description: rawAgent.description,
      publisher: rawAgent.publisher,
    },
    requestedScopes: {
      read: scopeAction(rawScopes.read),
      write: scopeAction(rawScopes.write),
    },
    requiredCapabilities: raw.required_capabilities,
    optionalCapabilities: raw.optional_capabilities,
    requiresRemote: Boolean(raw.requires_remote),
    externalDataSources: raw.external_data_sources,
    identity: raw.identity
      ? {
          did: raw.identity.did,
          verificationMethods: raw.identity.verification_methods,
          proof: raw.identity.proof
            ? {
                type: String(raw.identity.proof.type ?? ''),
                created: String(raw.identity.proof.created ?? ''),
                proofValue: String(raw.identity.proof.proofValue ?? ''),
              }
            : undefined,
        }
      : undefined,
  };
}

export async function loadManifest(agentPath: string): Promise<AgentManifest | null> {
  try {
    const content = await readFile(join(agentPath, 'uom.json'), 'utf-8');
    const raw = JSON.parse(content) as RawAgentManifest;
    return normalizeManifest(raw);
  } catch {
    return null;
  }
}

export function getFieldDeclarations(raw: RawAgentManifest): { fields: Record<string, string[]>; purposes: Record<string, string> } {
  const read = raw.requested_scopes?.read;
  return {
    fields: read?.fields ?? {},
    purposes: read?.purposes ?? {},
  };
}

export function loadRawManifest(agentPath: string): Promise<RawAgentManifest | null> {
  return readFile(join(agentPath, 'uom.json'), 'utf-8')
    .then(content => JSON.parse(content) as RawAgentManifest)
    .catch(() => null);
}
