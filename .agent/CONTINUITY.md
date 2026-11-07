# ClaimDesk foundation

## [PLANS]
- 2026-11-07 [USER] Phase 3 is implemented and verified locally. Parent review and push remain explicitly outside this subagent's authorization. See docs/phase-3-report.md.
- 2026-11-07 [USER] Phase 2 supersedes the earlier Phase 1-only scope. Core product screens and audited DB workflows are implemented. Deployment remains the parent session’s next phase.
- [USER] Phase 1 only. Product screens come in Phase 2. Minimal login and authenticated home are implemented.
- [TOOL] Foundation implemented and verified except real Gemini success. Provider 503/504 blocks that acceptance check. See docs/phase-1-report.md for the handoff.

## [DECISIONS]
- [CODE] Domain tables own rule precedence and lifecycle actions. Checklist evaluation requires explicit stage and reviewed fields as its fourth argument.
- [CODE] All unconfirmed unsorted documents block, including processing and failed uploads. Date-only freshness uses IST midnight.
- [CODE] Session JWT contains only user ID. Role is read from DB for every protected server operation.
- [CODE] Integration tests use a new schema inside a transaction, copy seeded fixtures, and roll back everything.

## [PROGRESS]
- 2026-11-07 [TOOL] Final checks pass: lint, TypeScript, 91 tests, five serial production-build Playwright journeys, build and real AI smoke 2/2 through configured Gemini 2.5 fallback. All eleven screenshots recaptured and inspected at 1440 px desktop / 390 px phone, with no horizontal page overflow. Final DB reset restores 10 claims, 66 docs, 110 fields, 3 queries, 37 events and 19 rules; no E2E claims remain.
- [TOOL] Head-confirmed reset and cron authorization verified on the production artifact. Early Proxy role read fixes streamed forbidden pages returning HTTP 200; actual executive settings HTTP response is now 403 and actions independently reject the role. Test cleanup removes its own Blob upload and created claims, then reseeds.
- 2026-11-07 [TOOL] Phase 3 units 1-3 committed as 71839a4, e966c79 and fcd5975. Fresh transactional reset, secured cron and head action, dense rules, immediate filters, confirmed-field grouping, regenerated in-memory PDFs and audited packet export are verified. No push.
- 2026-11-07 [TOOL] Additive settlement migration 0001 applied after isolated-schema tests. Insights and deduction capture pass all 83 tests, TypeScript, lint and build. Real browser settlement updated the dashboard; reseed restores it before final QA.
- [TOOL] Real regenerated PDF and handwritten-input smoke passed 2/2 after pinning Gemini request API v1beta. SDK 3 defaults to v1, which rejected the system instruction with 400.
- 2026-11-07 [TOOL] Phase 2 implements the worklist, new claim, claim file, pre-auth review, query inbox/detail/logging, head-only checklist rules, audit log, shell and polished login. See docs/phase-2-report.md.
- [TOOL] Backend and integration coverage committed as ed84696. Product screens and the synthetic ultrasound upload fixture committed as 92b4fbc. No push or deployment was performed.
- [TOOL] Gemini fallback commit 07e83f8 adds transient-only model fallback within 45 seconds and explicit N/2 smoke reporting. Final real smoke passed 2/2. Real browser ultrasound upload classified at 98%, stayed unconfirmed, and changed readiness only after confirmation.
- [TOOL] All 68 tests, lint, TypeScript, and production build passed. New integration tests use transaction-local savepoints inside an isolated schema and roll back all changes.
- [TOOL] Browser verified both roles, query answer lifecycle, stale platelets, head rule edit/readiness, audit filters, and private PDF preview. Screenshots are in docs/screenshots/. Production preview runs on localhost:3002; inherited dev server remains on 3001.
- [TOOL] Removed only the browser test’s new upload/event, preserved audit logs, and reran the seed. Demo restored to 8 claims, 49 documents, 88 fields, 3 queries, 27 events, and 19 rules.
- 2026-11-07 [TOOL] Schema migration applied. Commit a3657e0 has schema, domain, and unit tests.
- [TOOL] Seed created 2 users, 5 payers, 5 procedures, 15 types, 19 rules, 8 claims, 49 documents, 88 fields, 3 queries, 27 events.
- [TOOL] Final lint, TypeScript, all 47 tests including eight real DB integrations, and production build passed. Seed rerun retained 8 claims, 49 documents, 88 fields, 3 queries, 27 events; audit rows are 32 after seed and browser checks.
- [TOOL] Logged in through browser as both users on http://localhost:3001 and saw EXECUTIVE and HEAD. Logout worked. Authenticated PDF GET returned 200/application-pdf; unauthenticated request returned 401.
- [TOOL] Private Blob put/read SHA-256 round trip passed.

## [DISCOVERIES]
- [CODE] Phase 2 supersedes the single-request upload design with scoped direct private Blob uploads, avoiding deployment request-body limits for 10 MB files. Authenticated completion verifies type, size, actor and pathname; retries are idempotent. Interrupted uploads can leave orphan private objects and need production lifecycle cleanup.
- [CODE] db() now uses Neon Pool with poolQueryViaFetch for ordinary reads and WebSocket interactive transactions for atomic mutations. A late AI result does not overwrite a human move or confirmation.
- [TOOL] Real Gemini smoke returned 503/504 for PDF and PNG at 25s and 60s. A text-only call also timed out. Models.list succeeds and lists gemini-3.8-flash. A listed gemini-3.7-flash override also failed. Configured model and secrets are unchanged. Do not claim AI success without parsed output.
- [TOOL] Port 3000 belongs to another process. This session's dev server uses 3001.
- [TOOL] pnpm 12 wrote sharp's importer without its @types/node peer suffix. Corrected pnpm-lock.yaml importer and frozen install fixed the broken symlink.
- [USER] Database is Singapore, Blob is Mumbai. Real PHI is not permitted; docs/design.md records the production residency plan.
