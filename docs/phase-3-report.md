# Phase 3 handoff

ClaimDesk's fictional demo now supports fresh review-day data, denser desk workflows, audited PDF packets and settlement insights. The implementation is local for review. No push or deployment was performed.

## 1. Fresh demo and secured resets

`seed/run.ts` owns the shared, transactional reset. Admissions, report dates, extracted admission dates, query deadlines and lifecycle events are relative to the seed run. Admission dates use IST. CLM-3381 has a query about three hours overdue and a follow-up due in about two hours. CLM-3385 retains a stale platelet report under its 24-hour rule.

The reset restores sample-claim children and all checklist rules. Independently created claims and append-only audit history remain. Reset transactions take an advisory lock and lock sample claims before replacing their children. Document processing or review interrupted by a reset returns a reload message rather than dereferencing a removed record.

`/api/cron/reset-demo` requires the configured `CRON_SECRET` bearer. Missing and wrong credentials return 401. `vercel.json` retains `regions: ["bom1"]` and schedules the route at 21:30 UTC, around 03:00 IST. The head can confirm Reset demo data on the audit page. Both entry points append `DEMO_RESET` records.

The shared PDF renderer generates bytes in memory during reset. The serverless reset does not read or write fixture files. Committed examples remain available to upload and smoke scripts.

## 2. Focused design fixes and synthetic documents

- Checklist rules use an inline table with requirement, maximum age, source tier, note and actions. Save appears only for dirty rows. Exact-scope rules can be removed. The add row lists unused document types. Scope filters apply immediately. Waivers still require confirmation, and the affected open-claim count remains visible. No matrix was added because the table already explains precedence without a second overview.
- Worklist filters apply on change, with a 300 ms search debounce and URL parameters. Selected KPI filters have a visible Active marker and underline.
- Confirmed pre-auth fields live in a collapsed group, with reviewer, time and an Edit action. Pending and conflicting fields lead. Source links select the preview document.
- Claim status and the next reply deadline sit beside the title and readiness instead of across an empty header. Query summaries omit a duplicated summary sentence when it is already an ask.
- Synthetic PDFs have fictional hospital letterhead, labelled grids, signature lines, laboratory tables, reference ranges, radiology impressions and italic clinical notes. Every page retains the synthetic-patient stamp. Seeded source snippets cite text that appears in these documents.

Real AI checks exposed two SDK compatibility defects. Gemini requests now explicitly use API `v1beta`. Configured Gemini 2.5 fallbacks receive a token thinking budget rather than Gemini 3's thinking-level option. Model names and environment secrets were not changed.

## 3. Audited merged packets

Download packet exports the actual claim stage, independently of a previewed checklist tab. The cover includes claim and patient details, payer, procedure, stage, checklist states, confirmed pre-auth fields, generated time and preparer. Incomplete packets require a warning acknowledgement and list blockers prominently. Confirmed files follow in checklist order, then other confirmed files. PDF pages and PNG, JPEG and WebP images are supported.

The route authenticates the user, streams an attachment with `private, no-store`, and writes `PACKET_DOWNLOAD` with document IDs, stage, readiness and page count. It never sends to a payer. Corrupt or missing files fail the export rather than being silently omitted. Limits are 100 source files, 50 MB and 300 pages.

The production-route check for CLM-3381 returned 401 without a session and a six-page PDF when authenticated. The inspected cover listed the missing ultrasound, followed by five confirmed files. Tests cover images, long covers, exclusion of unconfirmed files and corrupt-file errors.

## 4. Settlement deductions and insights

Migration `0001_first_terror.sql` adds nullable settled amount, deduction amount and a five-value deduction-reason enum. Money remains integer paise. A database check requires a positive deduction amount and reason together, or both null. Existing records remain valid. Settlement, deduction, lifecycle event and audit row commit atomically.

The seed has ten claims, including three settlements with room-rent, co-pay and non-payable deductions. `/insights` is available to both roles and has no chart dependency. It reports waits from recorded submission times, hospital preparation separately, same-IST-day query response performance, overdue open queries and deductions by reason. Missing timestamps and unrecorded deductions are not presented as zero. Reference windows are labelled as references, not insurer-compliance findings.

The migration passed isolated-schema integration tests before application. A real browser settlement updated deduction totals, after which the demo was restored. The insights WCAG A/AA scan found zero violations.

## 5. End-to-end verification

`pnpm test:e2e` builds and starts the production app on a dedicated local port. Five serial Playwright journeys use the real database and private Blob store. Only that test server receives `AI_PROVIDER=fake`. The normal provider remains Gemini. Setup restores the demo; teardown removes only the current run's identified claims and uploads, then reseeds. Audit rows remain.

The suite covers upload and human confirmation, both query replies, executive HTTP 403, a rejected executive server action, head waivers and requirements changing readiness, blocked new claims, authenticated PDF downloads and executive insights access. The settings check in Proxy ensures a real 403 before Next's streamed shell; page and mutation checks remain in place.

## Final verification

Observed on 7 November 2026:

- `pnpm lint` passed.
- `pnpm exec tsc --noEmit` passed.
- `pnpm test` passed 91 tests across 12 files, including isolated real-Postgres integration tests.
- `pnpm test:e2e` passed all five serial journeys against `pnpm build && pnpm start`. A transient Neon `ENETUNREACH` background read was logged during that run; all five user journeys completed. Earlier failures were test synchronisation and selector issues, corrected before this passing run.
- `pnpm build` passed with the cron, packet, insights and early-403 routes.
- `pnpm ai:smoke` passed 2/2 regenerated inputs through configured fallback `gemini-2.5-flash`. The real output remains Zod-validated. Its log is `/tmp/opencode/claimdesk-phase3-ai-smoke.log`.
- The final production cron check returned 401 for missing and wrong bearers and 200 for the configured local verification bearer. It reported ten claims and 66 documents. The actual head button's confirmation and reset also completed successfully.
- Database checks found ten claims, 66 documents, 110 extracted fields, three queries, 37 lifecycle events and 19 rules. CLM-3381 again has one missing-document blocker and CLM-3385 one stale-document blocker. No E2E-created claims remain.
- Four concurrent authenticated file reads each returned HTTP 200 with the complete PDF while four parallel requests were cancelled. The fresh production capture run logged no server errors.
- The claim and rule-table WCAG A/AA scans found zero violations. The claim scan marked two timeline labels for manual contrast review; their computed colors give a 5.05:1 contrast ratio, above 4.5:1. The insights scan also found zero violations.
- The Impeccable detector returned `[]` for the changed desk and insight screens.

## Screenshots

All eleven files in `docs/screenshots/` were recaptured and inspected. Desktop viewports are 1440 × 1000; the phone viewport is 390 × 1000. Every capture's document width equals its viewport width. The capture script waits for transient toasts to disappear and for Chrome's native PDF viewer to finish loading, rather than treating network idle as PDF render completion.

- `login-desktop.png`
- `worklist-desktop.png`
- `claim-desktop.png`, CLM-3381
- `claim-mobile.png`, CLM-3381
- `platelet-stale-desktop.png`, CLM-3385
- `preauth-desktop.png`, confirmed group expanded and source PDF visible
- `queries-desktop.png`
- `query-detail-desktop.png`
- `checklists-desktop.png`, Company B and gall bladder scope
- `insights-desktop.png`
- `audit-desktop.png`

## Environment variables

- `CRON_SECRET` is the only new deployment secret. The parent must configure it in Vercel.
- `AI_PROVIDER=fake` is a local E2E-server override only. Unset means Gemini. No model names or existing secrets were changed.
- `E2E_PORT` and `SCREENSHOT_BASE_URL` are optional local tooling controls. `E2E_RUN_ID` is generated for scoped test cleanup.

## Remaining boundaries

- `CRON_SECRET` must be configured in Vercel before the scheduled reset can run there. Never deploy `AI_PROVIDER=fake`.
- The additive migration has been applied to the configured demo database. The code and screenshots still need the parent's review and push.
- The demo remains synthetic-only. Database residency, cross-border AI processing, shared login throttling and production retention require the work described in `docs/design.md`.
- Packet cover text uses standard PDF fonts. Unsupported non-Latin cover characters become question marks; source document pages remain intact.
- Interrupted non-test uploads can still leave unreferenced private objects. Test teardown removes its own upload object, but a general production orphan-retention job remains outside this phase.

Model the Domain kept checklist gates, transitions, deduction reasons and insight calculations in shared domain structures. Boundary Discipline kept validation and authorization at request and mutation boundaries. Prove It Works required real database, private-file, browser, PDF and provider evidence. Sequence Work into Verifiable Units produced a separate verified commit for each requested priority item.
