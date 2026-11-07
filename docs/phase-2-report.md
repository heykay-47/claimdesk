# Phase 2 handoff

The hospital insurance desk now has the core ClaimDesk workspace, with missing documents and overdue payer replies visible at the top of a claim file. The screens use the real database, private files, and Gemini. Payer communication remains manual.

## Screens

- `/login` has one-click demo credential fill, validation, and both supported roles.
- `/` redirects to `/claims`. The shell has the ClaimDesk wordmark, claim and query navigation, an overdue-aware query badge, and a user menu with Sign out. Head-only navigation is hidden from executives.
- `/claims` has clickable KPI filters, URL-based search and filters, readiness, countdowns, payer kinds, assignees, row navigation, and no-results and empty states.
- `/claims/new` validates admission details and rupee amounts. Creation writes a pre-auth draft, its first lifecycle event, and an audit row atomically.
- `/claims/[code]` shows the first blocker, next reply deadline, milestone timeline, legal next actions, gate blockers, stage previews, grouped checklist gaps, collapsed satisfied documents, open queries, admission details, and hospital-side timing. Uploads have per-file progress. Documents support preview, confirmation, report-date correction, drag-and-drop, and a keyboard-accessible Move to menu. Failed or low-confidence AI results stay in the unsorted tray.
- `/claims/[code]/preauth` shows editable registry fields, source quotes and document links, confidence, review status, conflicts, and Confirm or Reject actions. Missing fields can be entered against an uploaded source document. The source PDF or image sits alongside the fields on wide screens.
- `/queries` has open and answered views ordered by due time. Detail pages show the summary, review checklist, requested-document state, complete original email, template drafting, and confirmed recording of an externally sent reply. `/queries/new` logs an incoming email, summarises it, computes its deadline, and moves the claim to Query when legal. Failed summaries preserve the email and offer Retry AI summary.
- `/settings/checklists` resolves the selected payer, procedure, and stage. Each requirement identifies its source. The head can add, override, edit, waive with confirmation, and delete rules. The affected open-claim count appears before saving. `/settings/audit` has action and actor filters, detail disclosures, and pagination. Executives receive the forbidden page; mutations independently recheck the role.

## Decisions

`src/domain/checklist.ts`, `claim-status.ts`, `deadline.ts`, and `preauth-fields.ts` remain the domain authorities. The interface does not reproduce their gates or precedence rules.

`src/server/mutations.ts` parses inputs with Zod and authenticates the current database user. Claim writes lock the claim row. Changes, lifecycle events, and audit records share a transaction. The final open query, not the first reply, returns a Query claim to Pre-auth sent. Field confirmation rejects competing suggestions. A completed AI request cannot overwrite a newer human document correction.

`src/server/direct-upload.ts` issues a five-minute token for one user-scoped private pathname, MIME type, and size. Browser-to-Blob uploads preserve the full 10 MB limit without sending file bytes through a deployment request-body limit. Completion verifies the object and records it before AI processing. Repeated completion does not duplicate the document or extracted fields. Read-write credentials never reach the client. Preview and download use the authenticated file route.

Gemini uses the primary model followed by configured fallback models only on transient failures, within a shared 45-second budget. Validation failures do not trigger model fallback. The answering model is stored in the AI reason. The smoke script now prints an explicit N/2 result and fails if either input fails.

The restrained stone and teal visual system follows the supplied brief. Responsive layouts move the next action above longer claim content on a phone. Skeletons, empty states, retry boundaries, confirmations, and toasts cover the primary paths. The PDF preview fits the document width rather than opening a large thumbnail navigation pane.

## Verification

Observed on 7 November 2026:

- `pnpm lint` passed.
- `pnpm exec tsc --noEmit` passed.
- `pnpm test` passed all 68 tests across six files. These include 14 new real-Postgres mutation and action tests, with fake AI and Blob boundaries. The tests cover classification, failure and low-confidence handling, readiness after move and confirmation, transition gates, query deadlines, final-query lifecycle behavior, conflicting fields, server role checks, scoped tokens, and idempotent completion.
- `pnpm build` passed with the complete route set. The production artifact was run locally with `pnpm start --port 3002` for captures.
- `pnpm ai:smoke` passed with `AI smoke: 2/2 files classified and validated.` The final PDF result records `gemini-3.8-flash`; the PNG result records `gemini-3.5-flash`. Earlier real calls also passed with `gemini-3.5-flash` for both inputs. No environment secrets were changed by this task.
- The Impeccable detector returned `[]` for the changed workspace surfaces.
- The browser’s WCAG A and AA audit found zero violations on the audit page and the claim file. The claim scan initially required manual review of timeline contrast and ARIA naming. Timeline and countdown roles were corrected. Muted timeline text uses the same readable stone color as the surrounding interface.
- The desktop document width equalled the 1440 px viewport. The mobile document width equalled the 390 px viewport. Neither capture had horizontal page overflow.

### Real browser workflow

The executive applied the overdue KPI filter and opened CLM-3381. A real upload of `seed/files/CLM-3381-ULTRASOUND_REPORT.pdf` went directly to private Blob storage. Real Gemini classified it as `ULTRASOUND_REPORT` at 98% confidence, using `gemini-3.5-flash`. It remained unconfirmed until the executive clicked Confirm. Readiness then changed to Ready to submit, and the query’s requested document became Confirmed.

The executive drafted a reply and confirmed Mark reply as sent. The claim stayed in Query because its second query remained open. Recording the second reply returned the claim to Pre-auth sent. Both replies were recorded without sending email.

CLM-3385 showed its stale platelet report and a disabled enhancement submission. The executive could not access checklist management. The head selected Company D, Dengue with low platelets, and Enhancement. Changing the report age limit from 24 to 96 hours immediately made the claim ready and enabled the enhancement action. Audit filtering and page navigation were also exercised. The authenticated PDF preview rendered the synthetic pre-auth document alongside its extracted fields.

### Demo restoration

Only this browser test’s new upload and lifecycle event were removed. Its audit rows were preserved. `pnpm db:seed` then restored eight claims, 49 documents, 88 extracted fields, three queries, 27 lifecycle events, and 19 checklist rules. CLM-3381 again has its missing ultrasound and two open queries. CLM-3385 again has the 24-hour platelet rule. Subsequent browser checks only read records or sign in and out.

## Screenshots

Desktop captures use 1440 × 1000. The claim phone capture uses 390 × 1000.

- `docs/screenshots/login-desktop.png`
- `docs/screenshots/worklist-desktop.png`
- `docs/screenshots/claim-desktop.png`
- `docs/screenshots/claim-mobile.png`
- `docs/screenshots/platelet-stale-desktop.png`
- `docs/screenshots/preauth-desktop.png`
- `docs/screenshots/queries-desktop.png`
- `docs/screenshots/query-detail-desktop.png`
- `docs/screenshots/checklists-desktop.png`
- `docs/screenshots/audit-desktop.png`

The captures were inspected. The final correction batch improved mobile timeline wrapping, brought the next action forward on a phone, and widened the PDF preview. No unresolved clipping or horizontal overflow was observed in the captured screens.

## Remaining limits

- Deployment is the next phase. This task built and verified the local production artifact but did not deploy or push.
- This remains a synthetic-only demo. Singapore database residency, cross-border AI processing, shared login rate limits, retention policy, and production access controls still need the hospital’s production approval and hardening described in `docs/design.md`.
- Worklist reads batch the current dataset. Database-level filtering and pagination are a follow-up before the full hospital workload.
- Interrupted direct uploads can leave unreferenced private objects. A production object-retention or orphan cleanup job is still needed. No blocking document placeholder is created before a file completes.
- Native PDF controls vary by browser. The authenticated route supports the preview and download, but ClaimDesk does not implement a custom PDF editor.
- Hospital-side timing and recorded settlement are not a legal determination of insurer SLA compliance. The interface labels the reference windows and this limitation.

Model the Domain kept rule resolution and lifecycle behavior in the existing domain tables. Boundary Discipline put Zod and authorization at mutation, AI, and upload boundaries. Prove It Works required real Gemini, Postgres, private files, browser workflows, and direct screenshot inspection rather than build success alone.
