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

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  sessionId: string;
  agentId: string;
  action: string;
  key?: string;
  tags?: string[];
  allowed: boolean;
  reason: string;
}

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
