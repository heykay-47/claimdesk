# Phase 1 handoff

The ClaimDesk foundation supports the claims MVP's checklist, auth, private files, AI review boundary, and seeded case data. Phase 2 can build product screens on these modules. Real Gemini extraction remains unverified because the provider returned 503 and 504 responses.

## File map

- `src/db/schema.ts`, `drizzle.config.ts`, and `drizzle/` define and migrate the eleven SPEC tables, enums, indexes, checks, and null-aware checklist uniqueness.
- `src/domain/checklist.ts` resolves and evaluates rules. `claim-status.ts` owns legal actions and gates. `deadline.ts`, `preauth-fields.ts`, and `format.ts` own countdowns, field definitions, paise, and IST formatting.
- `src/server/auth.ts`, `session-token.ts`, `login-limit.ts`, and `src/proxy.ts` enforce sessions and roles. `audit.ts` inserts audit rows.
- `src/server/storage.ts` uploads and reads private files. `src/app/api/documents/[id]/file/route.ts` checks auth and records file access.
- `src/server/claim-checklist.ts` loads a claim's rules, documents, and reviewed fields before invoking the pure engine.
- `src/ai/client.ts`, `gemini.ts`, and `fake.ts` define the AI contract, production adapter, review-state mapping, and test fake.
- `src/app/login/` contains the minimal login page and server actions. `src/app/page.tsx` proves the authenticated name and role. shadcn components use the neutral Tailwind v4 preset.
- `seed/data.ts` and `scripts/generate-seed-pdfs.ts` define and generate the fictional records. `scripts/seed.ts` seeds Postgres and private Blob objects.
- `tests/` covers domain behavior, AI review rules, sessions, rate limits, and isolated real-Postgres integration.
- `docs/design.md` records decisions and production constraints. `docs/deployment.md` contains setup and verification commands.

## Seeded records

The database contains two users, five payers, five procedures, fifteen document types, nineteen rules, eight claims, forty-nine documents, eighty-eight extracted fields, three queries, and twenty-seven lifecycle events. Rerunning the seed preserves these counts and object paths.

The three required cases resolve as follows:

- CLM-3381 is in `QUERY`. Only the ultrasound document blocks the checklist. Its two open queries include one overdue request and one follow-up due soon.
- CLM-3382 is `PREAUTH_SUBMITTED` with a ready checklist and confirmed required fields.
- CLM-3385 is `ENHANCEMENT`, blocked by the older platelet report under the 24-hour rule.

The other claims cover draft, approved, final bill submitted, settled, and rejected states. An answered query belongs to the approved claim.

Fifty small PDFs and one handwritten-style PNG are committed under `seed/files/`. Every file has the required synthetic-patient stamp. Forty-nine PDFs belong to seeded claim documents; the extra PDF and PNG are AI smoke inputs.

## Verification

The migration was generated and applied to the configured Neon database. The actual SQL includes `UNIQUE NULLS NOT DISTINCT` for the checklist scope.

`pnpm lint`, `pnpm exec tsc --noEmit`, and `pnpm build` passed. `pnpm test` passed all 47 tests, including eight real-Postgres integration tests. The build includes `/`, `/login`, the authenticated document route, and Next.js Proxy.

Real integration tests run in a unique schema inside a transaction and roll back the schema and fixtures. Tests cover all three sample checklist outcomes, server role enforcement, blocked submission, null-scope uniqueness, seeded credentials, and query lifecycle consistency.

Browser verification on `http://localhost:3001` confirmed both users' names and roles, plus logout. A signed-in document request returned HTTP 200 with `application/pdf` and `private, no-store`. The same route without a session returned HTTP 401. Postgres contains the resulting two login rows, one logout row, and one document-view row.

The private Blob round trip returned `PASS`. The uploaded and downloaded 2,074-byte PDF had the same SHA-256 hash.

## AI smoke result

The configured `gemini-3.8-flash` is listed by the provider's model API. Real PDF and PNG generation calls returned 503 or 504. Lower reasoning effort and a 60-second diagnostic timeout did not produce a parsed result. A text-only request also timed out. A diagnostic run with listed predecessor `gemini-3.7-flash` returned the same failure pattern. The configured model and secrets were not changed.

The last default-model diagnostic output was:

```json
{"file":"preauth-form.pdf","failed":true,"errorType":"ApiError","status":504}
{"file":"handwritten-notes.png","failed":true,"errorType":"ApiError","status":503}
```

No successful real output is claimed. The implemented, Zod-validated success contract is `{document_type_key, confidence, reason, document_date, fields: [{key, value, source_snippet, confidence}]}`. Fake-client tests prove that classifications remain `NEEDS_REVIEW`, fields remain `PENDING`, and failures become `FAILED` without filling a checklist slot.

The remaining acceptance check is `pnpm ai:smoke` after provider recovery. Logs from this session are under `/tmp/opencode/isocode-ai-smoke*.log`.

## Decisions and limits

- Evaluation requires explicit stage and field context so an empty rule set cannot bypass required pre-auth fields.
- Failed and processing unsorted files block submission, in addition to the SPEC's explicit review-state blocker.
- Date-only reports use IST midnight for conservative freshness checks.
- Current roles come from Postgres, not stale JWT claims.
- The login limiter is process-local. A shared limiter is required for hardened multi-instance production use.
- The database is in Singapore and AI processing can be cross-border. This is a synthetic-only demo, not an India-resident production system.
- No product screens, insurer communications, portal integration, deployment, or automatic submission were added in Phase 1.

Model the Domain led to a transition table and discriminated checklist states. Boundary Discipline kept Zod parsing at form, AI, session, and file boundaries. Test Behavior, Not Implementation led to externally observable gate and database assertions. Prove It Works led to real login, private-stream, database, and provider checks, with the Gemini failure left explicit.
