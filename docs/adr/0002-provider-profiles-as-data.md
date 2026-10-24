# ADR 0002: Provider differences are data (YAML profiles), tested against one mock per profile

- Status: accepted
- Date: 2026-10-24

## Context

Cross-checking the specification (docs/SPEC-VERIFICATION.md) showed that providers differ in a
handful of concrete, documented ways: whether the query string is signed, timestamp timezone and
precision, `tokenType`, one case code, and endpoint paths. Hard-coding either behaviour would make
the suite wrong for some provider; scattering `if (provider === 'bri')` branches would make it
unreadable.

## Decision

1. Each provider is a YAML file in `profiles/`, validated by a strict zod schema. Every profile
   lists its sources, and fields no source confirmed must be listed in `unverified` (an enum, so a
   typo fails validation). Unverified fields are annotated on every test that uses the profile.
2. Values used as-is (paths, `queryString`, `tokenType`) are read directly. Values that need
   interpretation (case-code overrides, timestamp timezone and precision) go only through small
   accessors in `src/profiles/profile-rules.ts` (`caseFor`, `responseCodeFor`, `timestampFormatOf`),
   so each interpretation lives in one place.
3. The same profile drives both sides: the mock emulates it (`MOCK_PROFILE`) and the suite expects
   it (Playwright option fixture `profileName`). Playwright runs one project per profile, each
   against its own mock instance.
4. The asymmetric (SHA256withRSA) _transactional_ signature is **not** a profile option. Where
   the providers checked document it, it is for notifications they send to the partner, so it
   belongs with notification testing (Phase 4), not with partner-to-provider requests.

   _Correction (Phase 4):_ the sources do not agree on notifications either. PayerMax and DOKU's
   asymmetric-signature page describe asymmetric notifications; DOKU's signature overview says
   notifications are verified with the symmetric signature. Phase 4 implements the asymmetric
   form only and records the disagreement in docs/SPEC-VERIFICATION.md.

## Consequences

- Adding a provider is adding a file, not code. `npx playwright test --project <name>` tests it.
- The suite verifies the profile, too: against a real sandbox, a wrong profile value fails the test
  that owns it. This was checked by running one-field-wrong copies of the BRI profile against a
  BRI mock: each failed exactly the matching requirement (IDEM-002, SIG-006, TOK-001).
- Locally, Playwright may reuse a running mock. `/health?profile=<name>` returns 409 for a mock
  emulating another profile, so a mismatch fails at start-up instead of producing confusing results.
