import { SnapCase, SnapHeader } from '../../core';
import type { Clock } from '../clock';
import type { ExternalIdRegistry } from '../domain/external-id-registry';
import { SnapError } from '../errors';
import { readHeader, type RequestGuard } from './guard';

/**
 * Rejects a second use of the same `X-EXTERNAL-ID` by the same partner on the same day (409XX00).
 *
 * Placed last in the pipeline on purpose: only an authenticated, well-formed
 * request consumes the ID. See docs/adr/0001-consume-external-id-after-validation.md.
 */
export function claimExternalId(registry: ExternalIdRegistry, clock: Clock): RequestGuard {
  return (request) => {
    const partnerId = readHeader(request, SnapHeader.partnerId) ?? '';
    const externalId = readHeader(request, SnapHeader.externalId) ?? '';

    if (!registry.claim(partnerId, externalId, clock())) {
      throw new SnapError(SnapCase.conflict);
    }
  };
}
