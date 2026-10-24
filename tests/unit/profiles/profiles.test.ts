import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SnapCase } from '../../../src/core';
import {
  ProfileError,
  caseFor,
  listProfiles,
  loadProfile,
  timestampFormatOf,
  type ProviderProfile,
} from '../../../src/profiles';

describe('shipped profiles', () => {
  it('include the reference profile and the verified providers', () => {
    expect(listProfiles()).toEqual(['bca', 'bri', 'default']);
  });

  it.each(listProfiles())('"%s" is valid', (name) => {
    expect(() => loadProfile(name)).not.toThrow();
  });
});

describe('loadProfile', () => {
  const writeProfile = (fileName: string, content: string): string => {
    const dir = mkdtempSync(join(tmpdir(), 'snapcheck-profile-'));
    const file = join(dir, fileName);
    writeFileSync(file, content);
    return file;
  };

  const validYaml = (name: string, extra = ''): string => `
name: ${name}
displayName: Test
description: Test profile
sources: [https://example.com/docs]
paths: { accessToken: /a, balanceInquiry: /b, transferIntrabank: /c, transferStatus: /d }
timestamp: { timezone: WIB, milliseconds: false }
signature: { queryString: exclude }
accessToken: { tokenType: Bearer }
transferStatus: { notFound: http-404 }
${extra}`;

  it('loads a profile from a file path', () => {
    const file = writeProfile('my-bank.yaml', validYaml('my-bank'));
    expect(loadProfile(file).name).toBe('my-bank');
  });

  it('rejects a name that does not match the file name', () => {
    const file = writeProfile('my-bank.yaml', validYaml('other-bank'));
    expect(() => loadProfile(file)).toThrow(/expected "my-bank"/);
  });

  it('rejects an unknown field, so typos cannot be silently ignored', () => {
    const file = writeProfile('my-bank.yaml', validYaml('my-bank', 'timeZone: WIB'));
    expect(() => loadProfile(file)).toThrow(ProfileError);
  });

  it('rejects an unverified entry that is not a profile field', () => {
    const file = writeProfile('my-bank.yaml', validYaml('my-bank', 'unverified: [paths.typo]'));
    expect(() => loadProfile(file)).toThrow(ProfileError);
  });

  it('rejects an override for a case that does not exist', () => {
    const file = writeProfile(
      'my-bank.yaml',
      validYaml('my-bank', 'responseCases: { nope: "00" }'),
    );
    expect(() => loadProfile(file)).toThrow(ProfileError);
  });

  it('reports a missing profile clearly', () => {
    expect(() => loadProfile('does-not-exist')).toThrow(/Cannot read profile/);
  });
});

describe('profile rules', () => {
  const bri = loadProfile('bri');
  const reference: ProviderProfile = loadProfile('default');

  it('keeps the reference case code when there is no override', () => {
    expect(caseFor(reference, 'duplicatePartnerReferenceNo')).toBe(
      SnapCase.duplicatePartnerReferenceNo,
    );
  });

  it('applies a case code override without changing status or message', () => {
    expect(caseFor(bri, 'duplicatePartnerReferenceNo')).toMatchObject({
      httpStatus: 409,
      caseCode: '00',
    });
    expect(caseFor(bri, 'duplicatePartnerReferenceNo').message()).toBe(
      'Duplicate partnerReferenceNo',
    );
  });

  it('maps WIB to +07:00 and UTC to Z', () => {
    expect(timestampFormatOf(reference)).toEqual({ offsetMinutes: 420, milliseconds: false });
    expect(timestampFormatOf(bri)).toEqual({ offsetMinutes: 0, milliseconds: true });
  });
});
