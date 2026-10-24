import type { KeyObject } from 'node:crypto';

export interface Partner {
  readonly clientKey: string;
  readonly clientSecret: string;
  readonly partnerId: string;
  readonly publicKey: KeyObject;
}

export interface PartnerRegistry {
  findByClientKey(clientKey: string): Partner | undefined;
}

export class InMemoryPartnerRegistry implements PartnerRegistry {
  private readonly byClientKey: ReadonlyMap<string, Partner>;

  constructor(partners: readonly Partner[]) {
    this.byClientKey = new Map(partners.map((partner) => [partner.clientKey, partner]));
  }

  findByClientKey(clientKey: string): Partner | undefined {
    return this.byClientKey.get(clientKey);
  }
}
