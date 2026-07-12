import { SignJWT, jwtVerify, exportJWK, importJWK, generateKeyPair, type JWTPayload, type JWK } from 'jose';
import type { Scopes } from '@uomp/core';

export interface CapabilityTokenPayload {
  version: string;
  sessionId: string;
  agentId: string;
  issuedAt: string;
  expiresAt: string;
  scopes: Scopes;
  limits?: {
    maxReadQueries?: number;
    maxWriteQueries?: number;
  };
  profile?: 'local' | 'remote';
  audience?: string;
  allowedEndpoints?: string[];
}

export interface TokenLimits {
  maxReadQueries?: number;
  maxWriteQueries?: number;
}

export interface TokenIssuer {
  issue(payload: CapabilityTokenPayload): Promise<string>;
  verify(token: string): Promise<CapabilityTokenPayload>;
}

export class JWTTokenIssuer implements TokenIssuer {
  private privateJwk: JWK | undefined;
  private publicJwk: JWK | undefined;

  async generateKey(): Promise<JWK> {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
    this.privateJwk = await exportJWK(privateKey);
    this.publicJwk = await exportJWK(publicKey);
    this.privateJwk.kid = 'uomp-auth-key-1';
    this.privateJwk.alg = 'EdDSA';
    this.publicJwk.kid = 'uomp-auth-key-1';
    this.publicJwk.alg = 'EdDSA';
    return this.privateJwk;
  }

  async importKey(jwk: JWK): Promise<void> {
    this.privateJwk = { ...jwk };
    this.publicJwk = { ...jwk };
    delete this.publicJwk.d;
  }

  async issue(payload: CapabilityTokenPayload): Promise<string> {
    if (!this.privateJwk) {
      throw new Error('Token issuer not initialized. Call generateKey() or importKey() first.');
    }

    const privateKey = await importJWK(this.privateJwk, 'EdDSA');

    const jwt = await new SignJWT(this.payloadToJWT(payload))
      .setProtectedHeader({ alg: 'EdDSA', kid: this.privateJwk.kid ?? 'uomp-key' })
      .setIssuedAt()
      .setExpirationTime(payload.expiresAt)
      .sign(privateKey);

    return jwt;
  }

  async verify(token: string): Promise<CapabilityTokenPayload> {
    if (!this.publicJwk) {
      throw new Error('Token issuer not initialized. Call generateKey() or importKey() first.');
    }

    const publicKey = await importJWK(this.publicJwk, 'EdDSA');

    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['EdDSA'],
    });

    return this.jwtToPayload(payload);
  }

  getJWK(): JWK | undefined {
    return this.privateJwk;
  }

  private payloadToJWT(payload: CapabilityTokenPayload): JWTPayload {
    return {
      version: payload.version,
      session_id: payload.sessionId,
      agent_id: payload.agentId,
      issued_at: payload.issuedAt,
      expires_at: payload.expiresAt,
      scopes: payload.scopes,
      limits: payload.limits,
      profile: payload.profile,
      audience: payload.audience,
      allowed_endpoints: payload.allowedEndpoints,
    };
  }

  private jwtToPayload(jwt: JWTPayload): CapabilityTokenPayload {
    return {
      version: String(jwt.version ?? '1.0'),
      sessionId: String(jwt.session_id ?? ''),
      agentId: String(jwt.agent_id ?? ''),
      issuedAt: String(jwt.issued_at ?? ''),
      expiresAt: String(jwt.exp ?? ''),
      scopes: jwt.scopes as Scopes,
      limits: jwt.limits as TokenLimits | undefined,
      profile: (jwt.profile as 'local' | 'remote') ?? 'local',
      audience: jwt.audience as string | undefined,
      allowedEndpoints: jwt.allowed_endpoints as string[] | undefined,
    };
  }
}

export function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}
