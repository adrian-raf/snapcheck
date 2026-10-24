import { generateNumericId } from '../../core';

const REFERENCE_NO_LENGTH = 12;

/** The provider-side reference returned in every successful transactional response. */
export const generateReferenceNo = (): string => generateNumericId(REFERENCE_NO_LENGTH);
