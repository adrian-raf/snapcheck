import type { SnapCaseDefinition } from '../core';

/**
 * Thrown anywhere in the request pipeline to end the request with a SNAP error.
 * The service code is added later by the error handler, from the route config,
 * so guards stay reusable across services.
 */
export class SnapError extends Error {
  readonly snapCase: SnapCaseDefinition;
  readonly detail: string | undefined;

  constructor(snapCase: SnapCaseDefinition, detail?: string) {
    super(snapCase.message(detail));
    this.name = 'SnapError';
    this.snapCase = snapCase;
    this.detail = detail;
  }
}
