import type { KeyObject } from 'node:crypto';

import { SnapHeader, isValidSnapTimestamp, verifyNotification } from '../core';

/**
 * What a partner's notification endpoint must decide for every incoming notification,
 * as a pure function: is it really from the provider, and is it untampered?
 */

export interface IncomingNotification {
  readonly path: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: unknown;
}

export type NotificationVerdict =
  | { readonly verified: true }
  | {
      readonly verified: false;
      readonly reason: 'missing-signature' | 'invalid-timestamp' | 'bad-signature';
    };

export function judgeNotification(
  notification: IncomingNotification,
  providerPublicKey: KeyObject,
): NotificationVerdict {
  const header = (name: string): string | undefined => notification.headers[name.toLowerCase()];
  const signature = header(SnapHeader.signature);
  const timestamp = header(SnapHeader.timestamp) ?? '';

  if (!signature) return { verified: false, reason: 'missing-signature' };
  if (!isValidSnapTimestamp(timestamp)) return { verified: false, reason: 'invalid-timestamp' };

  const isAuthentic = verifyNotification({
    path: notification.path,
    body: notification.body,
    timestamp,
    signature,
    providerPublicKey,
  });
  return isAuthentic ? { verified: true } : { verified: false, reason: 'bad-signature' };
}

export interface RecordedNotification {
  readonly receivedAt: string;
  readonly verdict: NotificationVerdict;
  readonly body: unknown;
}

/** Keeps notifications in memory, indexed by originalPartnerReferenceNo for lookups. */
export class NotificationStore {
  private readonly byReference = new Map<string, RecordedNotification[]>();

  add(notification: RecordedNotification): void {
    const reference = referenceOf(notification.body);
    const list = this.byReference.get(reference) ?? [];
    list.push(notification);
    this.byReference.set(reference, list);
  }

  find(originalPartnerReferenceNo: string): readonly RecordedNotification[] {
    return this.byReference.get(originalPartnerReferenceNo) ?? [];
  }
}

function referenceOf(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'originalPartnerReferenceNo' in body) {
    return String(body.originalPartnerReferenceNo);
  }
  return '';
}
