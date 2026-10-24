# ADR 0001: Consume X-EXTERNAL-ID only after the request is validated

- Status: accepted
- Date: 2026-10-22

## Context

SNAP requires `X-EXTERNAL-ID` to be unique per partner per day. The standard does not say
whether a request that is **rejected** (bad signature, malformed body) still "uses up" its ID.
Providers differ, and the difference matters: if a rejected request consumes the ID, a client
that fixes a typo and resends gets `409 Conflict` and must generate a new ID — which some
client implementations do not expect.

## Decision

The mock registers the ID as the **last** guard, after authentication, signature verification
and body validation. Only a request that would otherwise be processed consumes its ID.

## Consequences

- A client can safely correct and resend a malformed request with the same ID.
- An unauthenticated caller cannot burn a partner's IDs, because it never reaches the registry.
- This is a policy of the mock, not a rule we can demand from providers. The related check
  (`IDEM-003`) is tagged `@mock-policy` and is skipped when the suite targets a real sandbox.
