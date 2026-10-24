import {
  SnapCase,
  WIB_OFFSET_MINUTES,
  responseCodeOf,
  type ServiceCodeValue,
  type SnapCaseDefinition,
  type SnapCaseName,
  type TimestampFormat,
} from '../core';
import type { ProviderProfile } from './profile-schema';

/**
 * Small, pure accessors that turn profile data into the values the rest of the
 * code needs. Callers never read raw profile fields for these rules, so the
 * interpretation lives in exactly one place.
 */

/** The response case as this provider documents it (case code overridden when the profile says so). */
export function caseFor(profile: ProviderProfile, name: SnapCaseName): SnapCaseDefinition {
  const reference = SnapCase[name];
  const caseCode = profile.responseCases[name];
  return caseCode === undefined ? reference : { ...reference, caseCode };
}

/** Full 7-digit response code as this provider documents it, e.g. BRI duplicate → `4091700`. */
export function responseCodeFor(
  profile: ProviderProfile,
  serviceCode: ServiceCodeValue,
  name: SnapCaseName,
): string {
  return responseCodeOf(serviceCode, caseFor(profile, name));
}

export function timestampFormatOf(profile: ProviderProfile): TimestampFormat {
  return {
    offsetMinutes: profile.timestamp.timezone === 'WIB' ? WIB_OFFSET_MINUTES : 0,
    milliseconds: profile.timestamp.milliseconds,
  };
}
