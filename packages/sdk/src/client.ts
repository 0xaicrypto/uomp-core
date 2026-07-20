import { Transport } from './transport.js';
import { MemoryClient } from './memory.js';
import { AggregateClient } from './aggregate.js';
import { PayloadClient } from './payload.js';
import { SessionClient } from './session.js';
import { AuditClient } from './audit.js';
import type { UompClientOptions } from './types.js';

export class UompClient {
  /** @internal */
  readonly _transport: Transport;
  readonly memory: MemoryClient;
  readonly aggregate: AggregateClient;
  readonly payload: PayloadClient;
  readonly audit: AuditClient;
  session: SessionClient;

  private _token: string;
  private _agentId: string;

  constructor(options: UompClientOptions = {}) {
    const token = options.token || process.env.UOM_TOKEN || '';
    const baseUrl = options.baseUrl || process.env.UOMP_BASE_URL || 'http://127.0.0.1:9374';
    const agentId = options.agentId || 'uomp-agent';
    const sessionId = options.sessionId || process.env.UOMP_SESSION_ID || '';

    this._token = token;
    this._agentId = agentId;

    this._transport = new Transport(
      { ...options, baseUrl, agentId },
      () => this._token
    );

    this.memory = new MemoryClient(this._transport);
    this.aggregate = new AggregateClient(this._transport);
    this.payload = new PayloadClient(this._transport);
    this.session = new SessionClient(this._transport, sessionId, agentId);
    this.audit = new AuditClient(this._transport);
  }

  get token(): string { return this._token; }
  set token(value: string) { this._token = value; }

  /** Whether using Gateway mTLS (baseUrl starts with https://) */
  get isRemote(): boolean {
    return this._transport.baseUrl.startsWith('https://');
  }

  /** Switch to a different session (e.g. in serverless mode) */
  useSession(sessionId: string, agentId?: string): this {
    this.session = new SessionClient(this._transport, sessionId, agentId ?? this._agentId);
    return this;
  }

  /** Health check */
  async health(): Promise<{ status: string; agent?: string; version?: string }> {
    return this._transport.requestJson('/v1/health');
  }

  static fromEnv(): UompClient {
    return new UompClient();
  }
}
