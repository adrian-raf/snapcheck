import { z } from 'zod';

import { SnapCase, type SnapCaseName } from '../core';

const CASE_NAMES = Object.keys(SnapCase) as [SnapCaseName, ...SnapCaseName[]];

const RelativePathSchema = z
  .string()
  .regex(/^\/[\w./-]*$/, 'must be a relative path starting with "/"');

/**
 * Every field a profile can mark as unverified. Using an enum (not free text)
 * means a typo in `unverified:` fails validation instead of silently hiding a gap.
 */
export const PROFILE_FIELDS = [
  'paths.accessToken',
  'paths.balanceInquiry',
  'paths.transferIntrabank',
  'paths.transferStatus',
  'timestamp.timezone',
  'timestamp.milliseconds',
  'signature.queryString',
  'accessToken.tokenType',
  'transferStatus.notFound',
  ...CASE_NAMES.map((name) => `responseCases.${name}` as const),
] as const;

export const ProviderProfileSchema = z
  .object({
    /** File name without extension, e.g. `bri`. */
    name: z.string().regex(/^[a-z0-9-]+$/),
    displayName: z.string().min(1),
    description: z.string().min(1),
    /** Public pages the values were taken from. */
    sources: z.array(z.url()).min(1),
    /** Fields that no source confirmed. Reported in every test that runs with this profile. */
    unverified: z.array(z.enum(PROFILE_FIELDS)).default([]),
    paths: z
      .object({
        accessToken: RelativePathSchema,
        balanceInquiry: RelativePathSchema,
        transferIntrabank: RelativePathSchema,
        transferStatus: RelativePathSchema,
      })
      .strict(),
    timestamp: z
      .object({
        /** `WIB` → `+07:00`; `UTC` → `Z`. */
        timezone: z.enum(['WIB', 'UTC']),
        milliseconds: z.boolean(),
      })
      .strict(),
    signature: z
      .object({
        queryString: z.enum(['exclude', 'include-sorted']),
      })
      .strict(),
    accessToken: z
      .object({
        tokenType: z.string().min(1),
      })
      .strict(),
    transferStatus: z
      .object({
        /**
         * How an unknown transaction is reported by the status inquiry:
         * `http-404` → 404XX01 Transaction Not Found (BRI, Paydia);
         * `status-07` → 200 with latestTransactionStatus "07" (Midtrans).
         */
        notFound: z.enum(['http-404', 'status-07']),
      })
      .strict(),
    /** Case codes that differ from the reference catalogue, e.g. `duplicatePartnerReferenceNo: "00"`. */
    responseCases: z
      .partialRecord(z.enum(CASE_NAMES), z.string().regex(/^\d{2}$/, 'must be two digits'))
      .default({}),
  })
  .strict();

export type ProviderProfile = z.infer<typeof ProviderProfileSchema>;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
