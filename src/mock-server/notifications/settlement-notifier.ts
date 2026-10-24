import type { KeyObject } from 'node:crypto';

import type { FastifyBaseLogger } from 'fastify';

import {
  buildNotificationHeaders,
  formatSnapTimestamp,
  generateExternalId,
  type TimestampFormat,
} from '../../core';
import type { Clock } from '../clock';
import type { TransferRecord, TransferService } from '../domain/transfer-service';
import { describeTransfer } from '../presenters/transfer-status';

/** Tells the partner when a pending transfer reaches its final status. */
export interface SettlementNotifier {
  scheduleFor(record: TransferRecord): void;
}

/** Used when no notification URL is configured. */
export const NO_NOTIFICATIONS: SettlementNotifier = { scheduleFor: () => undefined };

export interface HttpSettlementNotifierOptions {
  readonly url: URL;
  readonly providerPrivateKey: KeyObject;
  readonly transfers: TransferService;
  readonly clock: Clock;
  readonly timestampFormat: TimestampFormat;
  readonly log: FastifyBaseLogger;
}

/**
 * POSTs a signed notification to the partner's URL when a transfer settles.
 *
 * The body reuses the transfer status inquiry fields: no provider documents a
 * notification payload for intrabank transfers, so this shape is snapcheck's own.
 * One attempt per transfer; failures are logged, not retried.
 */
export class HttpSettlementNotifier implements SettlementNotifier {
  constructor(private readonly options: HttpSettlementNotifierOptions) {}

  scheduleFor(record: TransferRecord): void {
    const waitMs = Math.max(0, record.settlesAtMs - this.options.clock().getTime());
    // unref: a pending notification must not keep the process alive on shutdown.
    setTimeout(() => void this.send(record), waitMs).unref();
  }

  private async send(record: TransferRecord): Promise<void> {
    const { url, providerPrivateKey, transfers, clock, timestampFormat, log } = this.options;
    const body = describeTransfer(record, transfers.statusOf(record));
    const headers = buildNotificationHeaders({
      path: url.pathname,
      body,
      timestamp: formatSnapTimestamp(clock(), timestampFormat),
      externalId: generateExternalId(),
      providerPrivateKey,
    });

    try {
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      log.info(
        { partnerReferenceNo: record.partnerReferenceNo, status: response.status },
        'Settlement notification delivered',
      );
    } catch (error) {
      log.warn(
        { err: error, partnerReferenceNo: record.partnerReferenceNo },
        'Settlement notification failed',
      );
    }
  }
}
