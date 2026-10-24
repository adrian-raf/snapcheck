import { describe, expect, it } from 'vitest';

import { canonicalEndpointUrl } from '../../../src/core';

describe('canonicalEndpointUrl', () => {
  describe('exclude', () => {
    it.each([
      ['/v1.0/balance-inquiry', '/v1.0/balance-inquiry'],
      ['/v1.0/balance-inquiry?b=2&a=1', '/v1.0/balance-inquiry'],
      ['/v1.0/balance-inquiry?', '/v1.0/balance-inquiry'],
    ])('%s → %s', (url, expected) => {
      expect(canonicalEndpointUrl(url, 'exclude')).toBe(expected);
    });
  });

  describe('include-sorted', () => {
    it.each([
      ['no query', '/v1.0/x', '/v1.0/x'],
      ['sorts by name', '/v1.0/x?b=2&a=1', '/v1.0/x?a=1&b=2'],
      ['sorts repeated names by value', '/v1.0/x?a=2&a=1', '/v1.0/x?a=1&a=2'],
      ['sorts by code unit, uppercase first', '/v1.0/x?b=1&B=1', '/v1.0/x?B=1&b=1'],
      ['encodes spaces as %20, not +', '/v1.0/x?name=Budi+Santoso', '/v1.0/x?name=Budi%20Santoso'],
      [
        'encodes RFC 3986 reserved characters',
        "/v1.0/x?q=it's(ok)!*",
        '/v1.0/x?q=it%27s%28ok%29%21%2A',
      ],
      ['keeps empty values', '/v1.0/x?empty=&a=1', '/v1.0/x?a=1&empty='],
    ])('%s', (_case, url, expected) => {
      expect(canonicalEndpointUrl(url, 'include-sorted')).toBe(expected);
    });
  });
});
