/// <reference lib="dom" />

import { UompClient } from './client.js';

export { UompClient } from './client.js';
export { UompError, UompErrorCode } from './errors.js';
export { StoreRouter } from './store-router.js';
export * from './types.js';

export { MemoryClient } from './memory.js';
export { AggregateClient } from './aggregate.js';
export { PayloadClient } from './payload.js';
export { SessionClient } from './session.js';
export { AuthClient } from './auth.js';
export { AuditClient } from './audit.js';

const TOKEN_KEY = 'uomp_token';
const GATEWAY_KEY = 'uomp_gateway';

export const BrowserSDK = {
  saveToken(token: string) {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(TOKEN_KEY, token);
  },

  loadToken(): string {
    if (typeof sessionStorage !== 'undefined') return sessionStorage.getItem(TOKEN_KEY) || '';
    return '';
  },

  saveGatewayUrl(url: string) {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(GATEWAY_KEY, url);
  },

  loadGatewayUrl(): string {
    if (typeof sessionStorage !== 'undefined') return sessionStorage.getItem(GATEWAY_KEY) || '';
    return '';
  },

  fromUrlHash(): { token: string; gateway: string } {
    if (typeof window === 'undefined') return { token: '', gateway: '' };
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token') || '';
    const gateway = params.get('gateway') || '';
    if (token) this.saveToken(token);
    if (gateway) this.saveGatewayUrl(gateway);
    return { token, gateway };
  },

  createFromStorage(): UompClient {
    return new UompClient({
      token: this.loadToken(),
      baseUrl: this.loadGatewayUrl() || 'http://127.0.0.1:9374',
    });
  },

  /** Connect via wallet signature (MetaMask / Argent X placeholder) */
  async fromWallet(_chain?: 'ethereum' | 'starknet'): Promise<UompClient> {
    throw new Error(
      'Wallet auth not yet implemented for browser. ' +
      'Use BrowserSDK.createFromStorage() with a pre-existing token, ' +
      'or BrowserSDK.fromUrlHash() to read token from URL.'
    );
  },

  /** Create from seed phrase */
  fromSeedPhrase(_phrase: string): UompClient {
    throw new Error('Seed phrase auth not yet implemented for browser.');
  },
};
