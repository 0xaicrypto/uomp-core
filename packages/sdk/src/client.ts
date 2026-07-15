import { Transport } from './transport.js';
import { MemoryClient } from './memory.js';
import { AggregateClient } from './aggregate.js';
import { PayloadClient } from './payload.js';
import { SessionClient } from './session.js';
import { AuditClient } from './audit.js';
import type { UompClientOptions } from './types.js';

export class UompClient {
  readonly transport: Transport;
  readonly memory: MemoryClient;
  readonly aggregate: AggregateClient;
  readonly payload: PayloadClient;
  readonly session: SessionClient;
  readonly audit: AuditClient;

  private _token: string;

  constructor(options: UompClientOptions = {}) {
    const token = options.token || process.env.UOM_TOKEN || '';
    const baseUrl = options.baseUrl || process.env.UOMP_BASE_URL || 'http://127.0.0.1:9374';
    const agentId = options.agentId || 'uomp-agent';
    const sessionId = options.sessionId || process.env.UOMP_SESSION_ID || '';

    this._token = token;

    this.transport = new Transport(
      { ...options, baseUrl, agentId },
      () => this._token
    );

    this.memory = new MemoryClient(this.transport);
    this.aggregate = new AggregateClient(this.transport);
    this.payload = new PayloadClient(this.transport);
    this.session = new SessionClient(this.transport, sessionId, agentId);
    this.audit = new AuditClient(this.transport);
  }

  get token(): string {
    return this._token;
  }

  set token(value: string) {
    this._token = value;
  }

  static fromEnv(): UompClient {
    return new UompClient();
  }
}
