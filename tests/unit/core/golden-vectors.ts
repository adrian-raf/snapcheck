/**
 * Reference values computed independently with OpenSSL (not with this codebase),
 * so the tests compare our implementation against an outside source of truth:
 *
 *   printf '%s' "$BODY" | openssl dgst -sha256 -hex
 *   printf '%s' "$STRING_TO_SIGN" | openssl dgst -sha512 -hmac "$SECRET" -binary | base64
 */
export const GOLDEN = {
  body: { partnerReferenceNo: '2020102900000000000001', accountNo: '1234567890' },
  bodySha256: '31fb254e344e51e89c57673f8e1969fcce0d29b360049f6fd98edb5287ec19fa',
  emptySha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  method: 'POST',
  path: '/v1.0/balance-inquiry',
  accessToken: 'token-abc',
  timestamp: '2026-10-22T10:00:00+07:00',
  clientSecret: 'local-secret',
  stringToSign:
    'POST:/v1.0/balance-inquiry:token-abc:31fb254e344e51e89c57673f8e1969fcce0d29b360049f6fd98edb5287ec19fa:2026-10-22T10:00:00+07:00',
  hmacSha512Base64:
    'ArU5MMKADcoDtkrw0Ye88W3MXiIHMZO2pKtlJ2if3BE5yl3b7Cp8iZMcfHG4Jb5JQ1x+n2e4QoXGKYvrIpqTTw==',
} as const;
