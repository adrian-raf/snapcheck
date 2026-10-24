/**
 * Defaults for running everything locally against the mock server.
 *
 * These are throwaway, local-only values. Real provider credentials must come
 * from environment variables (see `.env.example`) and never be committed.
 */
export const LOCAL_PARTNER = {
  clientKey: 'snapcheck-local-client',
  clientSecret: 'snapcheck-local-secret-not-for-production',
  partnerId: 'snapcheck-local-client',
  channelId: '95221',
} as const;

/** The partner signs requests (token, and the private key never leaves the partner). */
export const LOCAL_KEY_PATHS = {
  privateKey: '.keys/partner-private.pem',
  publicKey: '.keys/partner-public.pem',
} as const;

/** The mock, acting as provider, signs the notifications it sends to the partner. */
export const LOCAL_PROVIDER_KEY_PATHS = {
  privateKey: '.keys/provider/private.pem',
  publicKey: '.keys/provider/public.pem',
} as const;

export const DEFAULT_MOCK_HOST = '127.0.0.1';
export const DEFAULT_MOCK_PORT = 4010;

/** The notification inbox: a stand-in for the partner's notification endpoint. */
export const DEFAULT_INBOX_PORT = 4100;
export const DEFAULT_INBOX_PATH = '/snap/notify';
