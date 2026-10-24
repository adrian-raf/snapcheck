# snapcheck

Conformance test harness and strict mock server for **SNAP BI** (Standar Nasional Open API
Pembayaran), the Indonesian national open API payment standard.

SNAP is one standard, but every bank and payment gateway implements it slightly differently —
timestamp formats, `X-EXTERNAL-ID` rules, response codes. Those differences are where
integrations break. snapcheck turns the rules into an executable, traceable test suite that
runs against a bundled mock or against a provider sandbox.

> Not affiliated with Bank Indonesia or ASPI. Rules are implemented from public provider
> documentation; verify them against the official SNAP specification before relying on them.

## What is inside

| Part                     | What it does                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core`               | Pure SNAP primitives: asymmetric token signature (SHA256withRSA), symmetric transactional signature (HMAC-SHA512), body minify + hash, timestamps, 7-digit response codes.                                    |
| `profiles/`              | One YAML file per provider (`default`, `bri`, `bca`): paths, timestamp format, query-string signing, `tokenType`, case-code overrides, sources, unverified fields.                                            |
| `src/mock-server`        | Fastify server that emulates one profile and enforces the rules strictly: token, balance inquiry, intrabank transfer, transfer status, idempotency, replay protection, fault injection, signed notifications. |
| `src/client`             | Reference client that recovers from uncertain transfers without paying twice (status before retry).                                                                                                           |
| `src/notification-inbox` | Stand-in for a partner's notification endpoint; verifies provider signatures.                                                                                                                                 |
| `tests/unit`             | Vitest tests for core, profiles and domain logic. Signatures are checked against vectors computed independently with OpenSSL.                                                                                 |
| `tests/conformance`      | Playwright suite: catalogued requirements tagged with ID and basis, run once per profile.                                                                                                                     |
| `docs/`                  | [Plan](docs/PLAN.md) and [spec verification](docs/SPEC-VERIFICATION.md) (Bahasa Indonesia), [requirement catalogue](docs/REQUIREMENTS.md), [ADRs](docs/adr).                                                  |

## Quick start

```bash
npm install
npm test          # unit tests, then the conformance suite (one mock per profile starts automatically)
```

Requires Node.js 22+. A throwaway RSA key pair is generated in `.keys/` on first run.
Open **`compliance-report/index.html`** for the result per requirement and profile.

## CLI

`npm run snapcheck -- <command>` (or `npx snapcheck <command>` after `npm link`). Works the same in
PowerShell, cmd and bash.

```bash
snapcheck run                              # every profile, each against its own mock
snapcheck run --profile bri                # one profile (starts only the BRI mock)
snapcheck run --grep @IDEM-001             # one requirement; or @standard, @provider-variant
snapcheck run --target https://sandbox.example.co.id --profile bri --env-file .env
snapcheck mock --profile bca --port 4010   # a mock emulating BCA
snapcheck inbox --port 4100                # a notification inbox that verifies signatures
snapcheck profiles                         # how the profiles differ
snapcheck requirements --basis mock-policy # the catalogue
```

Exit codes: `0` all checks passed, `1` a check failed, `2` invalid usage. `--help` on any command
lists its options.

## Never pay twice: faults and the reference client

The costliest integration bug is a transfer paid twice: the provider moves the money, the answer is
lost, and the client sends it again. The mock can misbehave on purpose, per request:

| `X-SNAPCHECK-FAULT`    | Money moves? | Answer                       |
| ---------------------- | ------------ | ---------------------------- |
| `error-before-commit`  | no           | 500                          |
| `error-after-commit`   | yes          | 500                          |
| `timeout-after-commit` | yes          | 200, too late for the client |
| `pending`              | yes          | 202; status Pending ~1 s     |

`src/client/transfer-with-recovery.ts` is a reference client for exactly this: when the outcome is
uncertain it asks for the transfer status first, resends only after "not found" and always with the
same `partnerReferenceNo`, and stops with outcome `unknown` (hand over to a person) if the status
never becomes final. The `@resilience` tests run it against each fault on fresh accounts and assert
the balances: a client that resends blindly with a new reference fails with `990000.00` expected,
`980000.00` received.

Point your own client at the mock and send the header to rehearse the same situations. When a
`pending` transfer settles, the mock POSTs a notification signed with `.keys/provider/private.pem`
to `MOCK_NOTIFICATION_URL`; `snapcheck inbox` receives and verifies it. See
[ADR 0003](docs/adr/0003-fault-injection-and-reference-client.md).

## Compliance report

Every run writes `compliance-report/`:

| File          | For                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`  | People. Self-contained page: verdict per profile, requirement × profile matrix, and for each failure its business risk, source and error. |
| `summary.md`  | Pull requests. Also appended to the GitHub Actions job summary automatically.                                                             |
| `report.json` | Other tools.                                                                                                                              |

A requirement fails if any of its tests failed (a flaky test counts as failed), is skipped if all
of its tests were skipped, and is "not run" when filtered out. The Playwright HTML report
(`npm run report`) remains available for debugging individual tests.

## Docker

```bash
npm run keys:ensure                  # once: containers mount the host key pair read-only
docker compose up -d --build         # bca :4010, bri :4011, default :4012, inbox :4100
npx playwright test                  # reuses the running containers (locally; not with CI=1)
```

The image runs only the mock, as a non-root user, with a health check. The `docker` job in CI
builds it and runs the suite against each container.

## Provider profiles

Each file in `profiles/` describes how one provider implements the parts of SNAP that differ
between providers. The same file drives both the mock (what it emulates) and the suite (what it
expects), and Playwright runs one project per profile against its own mock.

To add a provider, copy `profiles/default.yaml`, change the values, list your sources, and put
every value you could not confirm under `unverified`. The schema is strict: unknown keys and typos
fail validation. Unverified fields appear as an annotation on every test in the HTML report.

## Running against a sandbox

Copy `.env.example` to `.env` and fill in the provider's sandbox values, then:

```bash
npm run snapcheck -- run --env-file .env --grep @standard
```

When `SNAP_BASE_URL` is set no mock is started, a single `sandbox` project runs with
`SNAP_PROFILE`, and `@mock-policy` checks are skipped. A failing `@provider-variant` check usually
means the profile is wrong, not the provider. Use only credentials you own, respect the provider's
sandbox terms, and run it manually rather than on every push.

## Design highlights

- **One rule per guard.** Each mock check (`requireHeaders`, `verifyTransactionalSignature`,
  `claimExternalId`, …) is a small function; `pipelines.ts` defines their order once for every
  transactional service.
- **Tests break one thing at a time.** `SnapClient` signs correctly by default and exposes
  explicit levers (`signWith`, `sentBody`, `headers.omit`) for negative cases.
- **Status and code are asserted together.** `expect(res).toHaveSnapResponseCode('4091100')`.
- **Provider differences are data, not branches.** No `if (provider === 'bri')` anywhere; values
  that need interpretation go through small accessors (`caseFor`, `timestampFormatOf`).
- **Traceability is enforced.** `npm run requirements:doc` fails if a requirement has no test.
- **Money is never a float.** Amounts become `bigint` minor units.
- **Secure defaults.** Constant-time HMAC comparison, identical failure reasons to prevent
  client enumeration, sensitive headers redacted from logs.

## License

MIT
