# ADR 0003: Fault injection in the mock, proven by a reference client

- Status: accepted
- Date: 2026-10-24

## Context

The costliest SNAP integration bug is not a wrong signature (it fails loudly) but a transfer paid
twice: the provider moves the money, the response is lost (500, timeout, dropped connection), and
the client sends the transfer again. Testing a provider's happy path cannot reveal this. What a
partner needs is a way to make the provider misbehave _on purpose_, at the worst moment.

## Decision

1. **Fault injection, per request.** The transfer endpoint accepts a header
   `X-SNAPCHECK-FAULT` with one of: `error-before-commit`, `error-after-commit`,
   `timeout-after-commit`, `pending`. Per-request (instead of a global switch) keeps parallel tests
   independent and makes each test state its fault explicitly. The header is not signed and only
   the mock understands it; an unknown value is rejected, never ignored.
2. **Time without timers.** A pending transfer stores `settlesAtMs`; its status is computed from the
   injected clock. Tests can therefore move time forward instead of sleeping. Only the outgoing
   notification uses a real timer (it is I/O).
3. **A reference client, not just a mock.** `src/client/transfer-with-recovery.ts` encodes the
   recovery rule: _when the outcome is uncertain, ask for the status before sending again; resend
   only after "not found", and always with the same partnerReferenceNo._ Its HTTP access sits behind
   a two-method `TransferGateway`, so the same logic is tested in milliseconds with scripted answers
   (unit tests) and end to end against the mock (Playwright, RES-001…RES-004).
4. **Balances are the oracle.** Resilience tests run on accounts the mock creates on first use
   (account numbers starting with 8, fixed opening balance), so each test asserts exact balances
   even while tests run in parallel. The balance is asserted first: it is the business outcome.
5. **Isolation from provider conformance.** These tests carry the basis `resilience` and the tag
   `@mock-only`; they are skipped against a real sandbox, where faults cannot be injected.

## Consequences

- Planted bugs are caught, and for the right reason: a client that resends blindly with a new
  partnerReferenceNo fails on the balance (`990000.00` expected, `980000.00` received — paid
  twice); one that resends blindly with the same partnerReferenceNo keeps the money safe (the
  provider rejects the duplicate) but still fails, on `submissions: 2`.
- The outcome `unknown` is a deliberate end state: when the status never becomes final, the client
  stops and hands over to a person rather than guessing.
- The fault set is small on purpose. A status inquiry that itself fails is covered by unit tests
  (`unavailable`), not by a mock fault.
