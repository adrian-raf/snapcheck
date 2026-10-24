import { randomBytes } from 'node:crypto';

import type { Clock } from '../clock';

export interface IssuedToken {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
}

export interface TokenStore {
  issue(clientKey: string): IssuedToken;
  /** Returns the client key the token was issued to, or `undefined` if unknown or expired. */
  resolveClientKey(accessToken: string): string | undefined;
}

interface TokenRecord {
  readonly clientKey: string;
  readonly expiresAtMs: number;
}

const TOKEN_BYTES = 32;

export class InMemoryTokenStore implements TokenStore {
  private readonly tokens = new Map<string, TokenRecord>();

  constructor(
    private readonly ttlSeconds: number,
    private readonly clock: Clock,
  ) {}

  issue(clientKey: string): IssuedToken {
    const accessToken = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAtMs = this.clock().getTime() + this.ttlSeconds * 1000;
    this.tokens.set(accessToken, { clientKey, expiresAtMs });
    return { accessToken, expiresInSeconds: this.ttlSeconds };
  }

  resolveClientKey(accessToken: string): string | undefined {
    const record = this.tokens.get(accessToken);
    if (!record) {
      return undefined;
    }
    if (this.clock().getTime() >= record.expiresAtMs) {
      this.tokens.delete(accessToken);
      return undefined;
    }
    return record.clientKey;
  }
}
