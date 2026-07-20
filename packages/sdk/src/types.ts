import type { MemoryItem, Sensitivity, AuditLogEntry } from '@uomp/core';

export type { MemoryItem, Sensitivity, AuditLogEntry };

export type AggregateOp = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface AggregateResult {
  op: AggregateOp;
  field?: string;
  result: number;
  tag?: string;
}

export interface PayloadInfo {
  payload_id: string;
  size: number;
}

export interface DeletionProofResult {
  status: string;
  deletion_proof_id: string;
}

export interface DeletionProofOptions {
  fieldsAccessed?: string[];
  method?: string;
  memoryHash?: string;
}

export interface RefreshResult {
  token: string;
  expires_at: string;
}

export interface AuditQueryOptions {
  sessionId?: string;
  agentId?: string;
  limit?: number;
}

export interface UompClientOptions {
  token?: string;
  baseUrl?: string;
  agentId?: string;
  sessionId?: string;
  tls?: {
    certPath?: string;
    keyPath?: string;
    caPath?: string;
    rejectUnauthorized?: boolean;
  };
  transport?: {
    timeout?: number;
    retries?: number;
    retryBackoff?: number;
    fetch?: typeof fetch;
  };
}
