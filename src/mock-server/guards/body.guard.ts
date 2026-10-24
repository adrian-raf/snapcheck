import type { z } from 'zod';

import { SnapCase } from '../../core';
import { SnapError } from '../errors';
import type { RequestGuard } from './guard';

/**
 * Validates the body against a schema and replaces it with the parsed value.
 *
 * SNAP distinguishes a *missing* field (Invalid Mandatory Field) from a
 * *malformed* one (Invalid Field Format). Zod reports both as issues, so the
 * guard looks the field up in the raw body to tell them apart.
 */
export function validateBody(schema: z.ZodType): RequestGuard {
  return (request) => {
    const result = schema.safeParse(request.body ?? {});
    if (result.success) {
      request.body = result.data;
      return;
    }

    const [firstIssue] = result.error.issues;
    const path = firstIssue?.path ?? [];
    const fieldName = path.map(String).join('.');
    const isMissing = valueAtPath(request.body, path) === undefined;

    throw new SnapError(
      isMissing ? SnapCase.invalidMandatoryField : SnapCase.invalidFieldFormat,
      fieldName,
    );
  };
}

function valueAtPath(source: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}
