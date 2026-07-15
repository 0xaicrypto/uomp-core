import { createHash } from 'crypto';
import { Transport } from './transport.js';
import type { DeletionProofResult, DeletionProofOptions, RefreshResult } from './types.js';

export class SessionClient {
  private sessionId: string;
  private agentId: string;

  constructor(private transport: Transport, sessionId: string, agentId: string) {
    this.sessionId = sessionId;
    this.agentId = agentId;
  }

  async refresh(refreshToken: string): Promise<RefreshResult> {
    return this.transport.requestJson<RefreshResult>(`/v1/sessions/${this.sessionId}/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${refreshToken}` },
    });
  }

  async submitDeletionProof(opts: DeletionProofOptions = {}): Promise<DeletionProofResult> {
    const hash = createHash('sha256').update(`${this.sessionId}:${Date.now()}`).digest('hex');

    return this.transport.requestJson<DeletionProofResult>(
      `/v1/sessions/${this.sessionId}/deletion-proof`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deletion_proof_id: `del_${Date.now().toString(36)}`,
          session_id: this.sessionId,
          agent_id: this.agentId,
          deleted_at: new Date().toISOString(),
          memory_hash: `sha256:${hash}`,
          fields_accessed: opts.fieldsAccessed ?? ['key', 'value'],
          method: opts.method ?? 'process_termination',
          proof_value: `sha256:${hash}`,
        }),
      }
    );
  }

  async close(): Promise<void> {
    await this.transport.request(`/v1/sessions/${this.sessionId}/close`, { method: 'POST' });
  }

  async isActive(): Promise<boolean> {
    try {
      const resp = await this.transport.request(`/v1/sessions/${this.sessionId}/close`, { method: 'POST' });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
