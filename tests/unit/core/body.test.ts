import { describe, expect, it } from 'vitest';

import { hashBody, minifyBody } from '../../../src/core';
import { GOLDEN } from './golden-vectors';

describe('minifyBody', () => {
  it('serialises an object without whitespace, preserving key order', () => {
    expect(minifyBody({ b: 1, a: { c: 'x y' } })).toBe('{"b":1,"a":{"c":"x y"}}');
  });

  it('re-serialises a pretty-printed JSON string to its compact form', () => {
    const pretty = JSON.stringify(GOLDEN.body, null, 2);
    expect(minifyBody(pretty)).toBe(JSON.stringify(GOLDEN.body));
  });

  it.each([undefined, null, '', '   '])('treats %j as an empty body', (body) => {
    expect(minifyBody(body)).toBe('');
  });

  it('rejects a string that is not JSON instead of hashing it silently', () => {
    expect(() => minifyBody('not-json')).toThrow(SyntaxError);
  });
});

describe('hashBody', () => {
  it('matches the OpenSSL SHA-256 reference value', () => {
    expect(hashBody(GOLDEN.body)).toBe(GOLDEN.bodySha256);
  });

  it('hashes compact and pretty-printed payloads identically', () => {
    expect(hashBody(JSON.stringify(GOLDEN.body, null, 4))).toBe(GOLDEN.bodySha256);
  });

  it('hashes an empty body as the SHA-256 of an empty string', () => {
    expect(hashBody(undefined)).toBe(GOLDEN.emptySha256);
  });
});
