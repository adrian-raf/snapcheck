import Fastify, { type FastifyInstance } from 'fastify';

import './fastify-augmentation';
import { timestampFormatOf } from '../profiles';
import { systemClock, type Clock } from './clock';
import type { MockServerConfig } from './config';
import { InMemoryAccountRepository, SEED_ACCOUNTS } from './domain/accounts';
import { InMemoryExternalIdRegistry } from './domain/external-id-registry';
import { InMemoryPartnerRegistry } from './domain/partner-registry';
import { InMemoryTokenStore } from './domain/token-store';
import { TransferService } from './domain/transfer-service';
import { snapErrorHandler } from './error-handler';
import {
  HttpSettlementNotifier,
  NO_NOTIFICATIONS,
  type SettlementNotifier,
} from './notifications/settlement-notifier';
import { registerAccessTokenRoute } from './routes/access-token.route';
import { registerBalanceInquiryRoute } from './routes/balance-inquiry.route';
import { registerHealthRoute } from './routes/health.route';
import { registerTransferIntrabankRoute } from './routes/transfer-intrabank.route';
import { registerTransferStatusRoute } from './routes/transfer-status.route';

export interface BuildAppOptions {
  readonly config: MockServerConfig;
  readonly clock?: Clock;
}

/** Composition root: the only place where concrete implementations are wired together. */
export function buildApp({ config, clock = systemClock }: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers["x-signature"]'],
    },
  });

  app.decorateRequest('partner', null);
  app.setErrorHandler(snapErrorHandler);

  const accounts = new InMemoryAccountRepository(SEED_ACCOUNTS);
  const transfers = new TransferService(accounts, clock);

  const settlementNotifier: SettlementNotifier = config.notifications
    ? new HttpSettlementNotifier({
        ...config.notifications,
        transfers,
        clock,
        timestampFormat: timestampFormatOf(config.profile),
        log: app.log,
      })
    : NO_NOTIFICATIONS;

  const deps = {
    clock,
    profile: config.profile,
    timestampToleranceSeconds: config.timestampToleranceSeconds,
    faultTiming: config.faultTiming,
    partners: new InMemoryPartnerRegistry([config.partner]),
    tokens: new InMemoryTokenStore(config.tokenTtlSeconds, clock),
    externalIds: new InMemoryExternalIdRegistry(),
    accounts,
    transfers,
    settlementNotifier,
  };

  registerHealthRoute(app, config.profile.name);
  registerAccessTokenRoute(app, deps);
  registerBalanceInquiryRoute(app, deps);
  registerTransferIntrabankRoute(app, deps);
  registerTransferStatusRoute(app, deps);

  return app;
}
