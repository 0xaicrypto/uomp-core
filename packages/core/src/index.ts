/**
 * UOMP Core - Shared types, constants, and utilities
 */

export const UOMP_VERSION = '1.0';
export const DEFAULT_PORT = 9374;
export const DEFAULT_HOST = '127.0.0.1';

export const DATA_DIR_NAME = '.uomp';
export const AGENTS_DIR_NAME = 'agents';
export const SECRETS_DIR_NAME = '.secrets';
export const MEMORY_DB_NAME = 'memory.db';
export const AUDIT_DB_NAME = 'audit.db';
export const AUTH_DB_NAME = 'auth.db';
export const PRIVATE_KEY_FILE_NAME = 'ed25519-private.jwk';
export const PUBLIC_KEY_FILE_NAME = 'ed25519-public.jwk';

export type Sensitivity = 'low' | 'medium' | 'high';

export interface MemoryItem<T = unknown> {
  key: string;
  value: T;
  tags: string[];
  sensitivity: Sensitivity;
  source: 'user' | 'agent';
  createdAt: string;
  updatedAt: string;
  description?: string;
}

export interface ScopeAction {
  tags: string[];
  keys: string[];
  denyTags: string[];
  denyKeys: string[];
}

export interface Scopes {
  read: ScopeAction;
  write: ScopeAction;
}

export interface AgentManifest {
  uompVersion: string;
  agent: {
    id: string;
    name: string;
    version: string;
    description?: string;
    publisher?: string;
  };
  requestedScopes: Scopes;
  requiredCapabilities?: string[];
  optionalCapabilities?: string[];
  requiresRemote?: boolean;
  identity?: AgentIdentity;
}

export interface AgentIdentity {
  did?: string;
  verificationMethods?: string[];
  proof?: {
    type: string;
    created: string;
    proofValue: string;
  };
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  sessionId: string;
  agentId: string;
  action: 'read' | 'write' | 'delete' | 'query';
  key?: string;
  tags?: string[];
  allowed: boolean;
  reason: string;
  requestSize?: number;
  responseSize?: number;
  queryCountRemaining?: number;
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
