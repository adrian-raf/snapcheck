import { z } from 'zod';

import { isValidSnapTimestamp } from '../../core';
import { isValidAmountValue, toMinorUnits } from '../domain/money';

/**
 * Field schemas shared by several SNAP services.
 * Maximum lengths are the SNAP values quoted in BRI's intrabank documentation.
 */

/** Beneficiary / inquired account number: numeric, up to 34 digits. */
export const AccountNoSchema = z.string().regex(/^\d{1,34}$/);

/** Source account number: numeric, up to 19 digits. */
export const SourceAccountNoSchema = z.string().regex(/^\d{1,19}$/);

export const PartnerReferenceNoSchema = z.string().min(1).max(64);

export const SnapDateTimeSchema = z.string().refine(isValidSnapTimestamp);

export const AmountSchema = z.object({
  value: z.string().refine((value) => isValidAmountValue(value) && toMinorUnits(value) > 0n),
  currency: z.literal('IDR'),
});
