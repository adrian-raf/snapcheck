/**
 * SNAP service codes: the middle two digits of every response code.
 * Only the services implemented by this project are listed.
 */
export const ServiceCode = {
  balanceInquiry: '11',
  transferIntrabank: '17',
  /** Durianpay, Midtrans, Paydia, BRI (response table). */
  transferStatusInquiry: '36',
  accessTokenB2B: '73',
} as const;

export type ServiceCodeValue = (typeof ServiceCode)[keyof typeof ServiceCode];
