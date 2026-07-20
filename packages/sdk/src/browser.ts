/**
 * UOMP SDK — Browser entry point.
 * Uses window.fetch, no mTLS, no Node.js dependencies.
 */

/// <reference lib="dom" />

import { UompClient } from './client.js';
import { Transport } from './transport.js';

// Force browser mode in Transport
(Transport as any)._forceBrowser = true;

export { UompClient } from './client.js';
export { UompError, UompErrorCode } from './errors.js';
export * from './types.js';

export { MemoryClient } from './memory.js';
export { AggregateClient } from './aggregate.js';
export { PayloadClient } from './payload.js';
export { SessionClient } from './session.js';
export { AuthClient } from './auth.js';
export { AuditClient } from './audit.js';

const TOKEN_KEY = 'uomp_token';
const GATEWAY_KEY = 'uomp_gateway';

/** Browser-specific helpers */
export const BrowserSDK = {
  /** Persist token to sessionStorage (cleared when tab closes) */
  saveToken(token: string) {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(TOKEN_KEY, token);
  },

  /** Load token from sessionStorage */
  loadToken(): string {
    if (typeof sessionStorage !== 'undefined') return sessionStorage.getItem(TOKEN_KEY) || '';
    return '';
  },

  /** Save Gateway URL */
  saveGatewayUrl(url: string) {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(GATEWAY_KEY, url);
  },

  /** Load Gateway URL */
  loadGatewayUrl(): string {
    if (typeof sessionStorage !== 'undefined') return sessionStorage.getItem(GATEWAY_KEY) || '';
    return '';
  },

  /** Parse token from URL hash (e.g., #token=xxx&gateway=xxx) */
  fromUrlHash(): { token: string; gateway: string } {
    if (typeof window === 'undefined') return { token: '', gateway: '' };
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token') || '';
    const gateway = params.get('gateway') || '';
    if (token) this.saveToken(token);
    if (gateway) this.saveGatewayUrl(gateway);
    return { token, gateway };
  },

  /** Create a client from stored token (sessionStorage) */
  createFromStorage(): UompClient {
    const token = this.loadToken();
    const gateway = this.loadGatewayUrl();
    return new UompClient({
      token,
      baseUrl: gateway || 'http://127.0.0.1:9374',
    });
  },
};
