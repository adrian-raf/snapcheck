/**
 * Where a rule comes from:
 * - `standard`: every provider we checked documents it the same way.
 * - `provider-variant`: providers document it differently; the expected value comes from the profile.
 * - `mock-policy`: a deliberate choice of this mock, not something to demand from a provider.
 * - `resilience`: behaviour of the reference client (src/client) under faults the mock injects.
 * Tests of the last two bases need the mock and are skipped against a real sandbox.
 */
export type RequirementBasis = 'standard' | 'provider-variant' | 'mock-policy' | 'resilience';

/** Bases whose tests only make sense against the bundled mock. */
export const MOCK_ONLY_BASES: readonly RequirementBasis[] = ['mock-policy', 'resilience'];

export interface Requirement {
  readonly title: string;
  readonly basis: RequirementBasis;
  /** Why the rule matters — the business risk if it is broken. */
  readonly risk: string;
  /** Where the rule was verified. Details and links: docs/SPEC-VERIFICATION.md. */
  readonly source: string;
}

const SIGNATURE_SOURCES = 'BRI, BCA, DOKU, Paydia, PayerMax (signature formulas)';
const RESPONSE_CODE_SOURCES = 'BRI, DOKU, Durianpay (response code tables)';

/** Single source of truth for every rule the suite checks. `npm run requirements:doc` renders it. */
export const REQUIREMENTS = {
  'TOK-001': {
    title: 'Issues an access token (2007300) with the tokenType documented in the profile',
    basis: 'standard',
    risk: 'No integration can start without a token.',
    source: 'BRI, BCA (access token B2B, service code 73; tokenType differs per provider)',
  },
  'TOK-002': {
    title: 'Rejects a token request signed with a different private key (4017300)',
    basis: 'standard',
    risk: 'Anyone could obtain tokens for a partner they do not control.',
    source: SIGNATURE_SOURCES,
  },
  'TOK-003': {
    title: 'Gives the same failure reason for an unknown X-CLIENT-KEY and a wrong signature',
    basis: 'mock-policy',
    risk: 'A detailed reason lets an attacker enumerate valid client keys.',
    source: 'Security hardening of this mock. BRI returns distinct reasons, which is allowed.',
  },
  'TOK-004': {
    title: 'Requires X-TIMESTAMP, X-CLIENT-KEY and X-SIGNATURE (400XX02)',
    basis: 'standard',
    risk: 'Unsigned token requests would be accepted.',
    source: `${RESPONSE_CODE_SOURCES}; BRI (token headers)`,
  },
  'TOK-005': {
    title: 'Rejects an X-TIMESTAMP that is not ISO 8601 with a timezone designator (400XX01)',
    basis: 'standard',
    risk: 'Ambiguous timestamps break signature verification and replay windows.',
    source: 'BCA, BRI, PayerMax (ISO 8601 with TZD; offset vs UTC is a provider variant)',
  },
  'TOK-006': {
    title: 'Requires grantType "client_credentials"',
    basis: 'standard',
    risk: 'Unsupported grant types must not silently issue tokens.',
    source: 'BRI (access token request body)',
  },
  'SIG-001': {
    title: 'Accepts a correctly signed transactional request',
    basis: 'standard',
    risk: 'Baseline: proves negative results below are not caused by a broken client.',
    source: SIGNATURE_SOURCES,
  },
  'SIG-002': {
    title: 'Rejects a body changed after signing (401XX00)',
    basis: 'standard',
    risk: 'A tampered amount or account number would be processed.',
    source: SIGNATURE_SOURCES,
  },
  'SIG-003': {
    title: 'Signs the minified body, so JSON whitespace on the wire does not matter',
    basis: 'standard',
    risk: 'Valid requests from clients that pretty-print JSON would be rejected.',
    source: `${SIGNATURE_SOURCES}: SHA-256 of minify(body)`,
  },
  'SIG-004': {
    title: 'Rejects a signature made with a different client secret (401XX00)',
    basis: 'standard',
    risk: 'A partner could sign requests on behalf of another partner.',
    source: SIGNATURE_SOURCES,
  },
  'SIG-005': {
    title: 'Rejects a signature computed for a different endpoint (401XX00)',
    basis: 'standard',
    risk: 'A signature captured on one endpoint could be replayed on another.',
    source: SIGNATURE_SOURCES,
  },
  'SIG-006': {
    title: 'Signs the query string exactly as the profile says (excluded, or included and sorted)',
    basis: 'provider-variant',
    risk: 'Clients signing the wrong EndpointUrl are rejected on every request that has query parameters.',
    source: 'BCA includes the sorted query string; BRI and PayerMax exclude it.',
  },
  'TS-001': {
    title: 'Rejects an X-TIMESTAMP more than 5 minutes from server time (401XX00)',
    basis: 'mock-policy',
    risk: 'A captured, correctly signed request could be replayed hours later.',
    source:
      'Replay protection of this mock (TIMESTAMP_TOLERANCE_SECONDS). No provider documents a window.',
  },
  'AUTH-001': {
    title: 'Rejects a transactional request without a bearer token (401XX01)',
    basis: 'provider-variant',
    risk: 'Unauthenticated access to account data.',
    source:
      'Durianpay/DOKU define 401XX01 for "Access Token Not Exist"; no table names the missing-header case explicitly.',
  },
  'AUTH-002': {
    title: 'Rejects an unknown or forged bearer token (401XX01)',
    basis: 'standard',
    risk: 'Forged tokens would grant access.',
    source: RESPONSE_CODE_SOURCES,
  },
  'AUTH-003': {
    title: "Rejects an X-PARTNER-ID that is not the token's partner (401XX00)",
    basis: 'mock-policy',
    risk: "One partner's token could be used to act on behalf of another partner.",
    source: 'Hardening of this mock; Durianpay lists "Client Forbidden Access API" under 401XX00.',
  },
  'HDR-001': {
    title: 'Rejects a transactional request missing any mandatory header (400XX02)',
    basis: 'standard',
    risk: 'Requests without traceability or idempotency data would be processed.',
    source: `BRI, BCA (mandatory headers); ${RESPONSE_CODE_SOURCES}`,
  },
  'IDEM-001': {
    title: 'Rejects the same X-EXTERNAL-ID twice on the same day (409XX00)',
    basis: 'standard',
    risk: 'A network retry could execute the same instruction twice.',
    source: `BCA (unique within the same day); ${RESPONSE_CODE_SOURCES}`,
  },
  'IDEM-002': {
    title:
      'Rejects a repeated partnerReferenceNo even with a new X-EXTERNAL-ID (409XX01, or the profile override)',
    basis: 'provider-variant',
    risk: 'Customers could be debited twice for one transfer.',
    source: 'DOKU, Durianpay, Midtrans use 409XX01; BRI documents 409XX00 for the same case.',
  },
  'IDEM-003': {
    title: 'A request rejected for an invalid body does not consume its X-EXTERNAL-ID',
    basis: 'mock-policy',
    risk: 'If it did, a client could not safely fix and resend a malformed request.',
    source: 'Not specified by any provider. See docs/adr/0001.',
  },
  'STS-001': {
    title:
      'Reports a completed transfer as latestTransactionStatus "00" with its provider reference (2003600)',
    basis: 'standard',
    risk: 'Without a reliable status, a client cannot tell a lost response from a failed transfer.',
    source: 'BRI, Midtrans, Paydia (transfer status inquiry, service code 36)',
  },
  'STS-002': {
    title:
      'Reports an unknown transaction as the profile documents (404XX01, or 200 with status "07")',
    basis: 'provider-variant',
    risk: 'A client that misreads "not found" either never retries a failed transfer or retries a paid one.',
    source:
      'BRI and Paydia answer 404XX01; Midtrans answers 2003600 with latestTransactionStatus 07.',
  },
  'RES-001': {
    title:
      'After a 500 that happened after the debit, the client checks status and does not pay twice',
    basis: 'resilience',
    risk: 'Blind retries after a lost response are the classic cause of double debits.',
    source:
      'Reference client; fault error-after-commit. Status-before-retry per BRI and Midtrans guidance.',
  },
  'RES-002': {
    title: 'After a 500 before the debit, the client confirms "not found" and retries safely once',
    basis: 'resilience',
    risk: 'Giving up on a transfer that never happened leaves the customer unpaid.',
    source: 'Reference client; fault error-before-commit.',
  },
  'RES-003': {
    title: 'After a client-side timeout, the client checks status and does not pay twice',
    basis: 'resilience',
    risk: 'Timeouts are ambiguous: the transfer may well have gone through.',
    source:
      'Reference client; fault timeout-after-commit. BRI: status inquiry "in the event of ... time out".',
  },
  'RES-004': {
    title: 'After 202 Request In Progress, the client polls status until it is final',
    basis: 'resilience',
    risk: 'Treating "in progress" as failure invites a second transfer; as success, a false confirmation.',
    source: 'Reference client; fault pending. 202XX00 per BRI, DOKU, Durianpay.',
  },
  'NTF-001': {
    title: 'Sends a notification signed SHA256withRSA when a pending transfer settles',
    basis: 'mock-policy',
    risk: 'Partners must reject unsigned or tampered notifications, or anyone can fake a payment confirmation.',
    source:
      'Signature per PayerMax and DOKU asymmetric pages. Payload is snapcheck-defined: no provider documents one for intrabank transfers.',
  },
  'BAL-001': {
    title: 'Returns the balance of a known account (2001100)',
    basis: 'standard',
    risk: 'Baseline for the balance inquiry service.',
    source: 'Durianpay (service code 11, /v1.0/balance-inquiry)',
  },
  'BAL-002': {
    title: 'Rejects an unknown account (404XX11)',
    basis: 'standard',
    risk: 'Clients must be able to tell "no such account" from other errors.',
    source: RESPONSE_CODE_SOURCES,
  },
  'TRF-001': {
    title: 'Completes an intrabank transfer and echoes the request identifiers (2001700)',
    basis: 'standard',
    risk: 'Without the echoed partnerReferenceNo, reconciliation is impossible.',
    source: 'BRI (transfer intrabank, service code 17)',
  },
  'TRF-002': {
    title: 'Rejects an IDR amount that does not have exactly two decimals (400XX01)',
    basis: 'standard',
    risk: '"10000" vs "100.00" ambiguity can move 100× the intended amount.',
    source: 'BRI ("if it is IDR then value includes 2 decimal digits")',
  },
  'TRF-003': {
    title: 'Rejects a transfer larger than the balance (403XX14)',
    basis: 'standard',
    risk: 'Overdrafts on accounts that do not allow them.',
    source: 'BRI, DOKU (Insufficient Funds)',
  },
  'TRF-004': {
    title: 'Reports a missing field (400XX02) differently from a malformed one (400XX01)',
    basis: 'standard',
    risk: 'Clients cannot tell which field to fix.',
    source: RESPONSE_CODE_SOURCES,
  },
} as const satisfies Record<string, Requirement>;

export type RequirementId = keyof typeof REQUIREMENTS;

export const REQUIREMENT_IDS = Object.keys(REQUIREMENTS) as RequirementId[];

export function isRequirementId(value: string): value is RequirementId {
  return Object.hasOwn(REQUIREMENTS, value);
}

/** `@IDEM-001` → `IDEM-001`; any other tag → `undefined`. */
export function requirementIdFromTag(tag: string): RequirementId | undefined {
  const id = tag.startsWith('@') ? tag.slice(1) : '';
  return isRequirementId(id) ? id : undefined;
}
