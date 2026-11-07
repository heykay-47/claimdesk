# ClaimDesk foundation

## [PLANS]
- [USER] Phase 1 only. Product screens come in Phase 2. Minimal login and authenticated home are implemented.
- [TOOL] Foundation implemented and verified except real Gemini success. Provider 503/504 blocks that acceptance check. See docs/phase-1-report.md for the handoff.

## [DECISIONS]
- [CODE] Domain tables own rule precedence and lifecycle actions. Checklist evaluation requires explicit stage and reviewed fields as its fourth argument.
- [CODE] All unconfirmed unsorted documents block, including processing and failed uploads. Date-only freshness uses IST midnight.
- [CODE] Session JWT contains only user ID. Role is read from DB for every protected server operation.
- [CODE] Integration tests use a new schema inside a transaction, copy seeded fixtures, and roll back everything.

## [PROGRESS]
- 2026-11-07 [TOOL] Schema migration applied. Commit a3657e0 has schema, domain, and unit tests.
- [TOOL] Seed created 2 users, 5 payers, 5 procedures, 15 types, 19 rules, 8 claims, 49 documents, 88 fields, 3 queries, 27 events.
- [TOOL] Final lint, TypeScript, all 47 tests including eight real DB integrations, and production build passed. Seed rerun retained 8 claims, 49 documents, 88 fields, 3 queries, 27 events; audit rows are 32 after seed and browser checks.
- [TOOL] Logged in through browser as both users on http://localhost:3001 and saw EXECUTIVE and HEAD. Logout worked. Authenticated PDF GET returned 200/application-pdf; unauthenticated request returned 401.
- [TOOL] Private Blob put/read SHA-256 round trip passed.

## [DISCOVERIES]
- [TOOL] Real Gemini smoke returned 503/504 for PDF and PNG at 25s and 60s. A text-only call also timed out. Models.list succeeds and lists gemini-3.8-flash. A listed gemini-3.7-flash override also failed. Configured model and secrets are unchanged. Do not claim AI success without parsed output.
- [TOOL] Port 3000 belongs to another process. This session's dev server uses 3001.
- [TOOL] pnpm 12 wrote sharp's importer without its @types/node peer suffix. Corrected pnpm-lock.yaml importer and frozen install fixed the broken symlink.
- [USER] Database is Singapore, Blob is Mumbai. Real PHI is not permitted; docs/design.md records the production residency plan.
