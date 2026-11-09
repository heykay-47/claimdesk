# ClaimDesk — build spec (internal working document)

Goal: a production-quality MVP of the Hospital Cashless Claims & TPA Tracking Workspace (see
`docs/isocode_hospital_cashless_claims_problem_statement.md`). Core slice first: claim file with
status timeline, admin checklist per insurer and procedure, uploads sorted into checklist slots,
gap view, query inbox with countdown. Roles: desk executive (EXECUTIVE) and desk head (HEAD).
AI: document sorting and field pre-fill, query summary. Nothing is ever sent to a TPA automatically.

## Stack (decided)

- Next.js 16 App Router (see `node_modules/next/dist/docs/` — this version has breaking changes;
  `middleware` is now `proxy.ts`, check before using), React 19, TypeScript strict, Tailwind v4.
- shadcn/ui components (init with the CLI), lucide icons. Font: Geist (already wired) or Inter.
- Postgres on Neon (`DATABASE_URL` pooled, `DATABASE_URL_UNPOOLED` direct for migrations).
  ORM: Drizzle (`drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless` neon-http or pool driver).
  Migrations are generated SQL files committed under `drizzle/`.
- Files now use private Postgres `document_files` bytes, saved atomically with documents; uploads are limited to 4 MB.
  Files are only ever streamed through an authenticated route handler that checks the session and logs
  an audit row. No public URLs reach the browser.
- AI: Google Gemini via `@google/genai`, model from `GEMINI_MODEL` (default `gemini-3.8-flash`),
  server-side only, `responseMimeType: 'application/json'` + `responseSchema`, then validated with zod.
- Auth: own credentials auth. `users` table with bcrypt (`bcryptjs`) hashes, session = signed JWT
  (`jose`, HS256, `SESSION_SECRET`) in an httpOnly, secure, sameSite=lax cookie, 8h expiry.
  Every server action / route handler calls `requireUser()` or `requireRole('HEAD')`. UI hiding is
  cosmetic only; the server is the enforcement point.
- Validation: zod at every boundary (form input, API input, AI output).
- Tests: Vitest (unit + integration against a real Postgres; integration tests may use a Neon branch or
  the dev DB with a dedicated schema; they must not depend on Gemini — inject a fake AI client), Playwright e2e.

## Domain model

Enums:
- `role`: EXECUTIVE | HEAD
- `payer_kind`: INSURER | TPA
- `claim_status`: PREAUTH_DRAFT | PREAUTH_SUBMITTED | QUERY | APPROVED | ENHANCEMENT | FINAL_BILL_SUBMITTED | SETTLED | REJECTED
- `stage` (which checklist applies): PREAUTH | ENHANCEMENT | DISCHARGE
- `requirement`: REQUIRED | OPTIONAL | WAIVED
- `doc_status`: PROCESSING | NEEDS_REVIEW | CONFIRMED | FAILED
- `field_status`: PENDING | CONFIRMED | REJECTED
- `query_status`: OPEN | ANSWERED

Tables:
- `users(id, email unique, name, role, password_hash, created_at)`
- `payers(id, name, kind, query_reply_hours int default 24, preauth_sla_minutes default 60, discharge_sla_minutes default 180)`
- `procedures(id, name, specialty)`
- `document_types(id, key unique, label, description, ai_hint)` — the catalogue the AI classifies into.
  Seed ~14: PREAUTH_FORM, PHOTO_ID, POLICY_CARD, DOCTOR_NOTES (clinical notes / admission notes, often handwritten),
  ULTRASOUND_REPORT, XRAY_REPORT, MRI_REPORT, CBC_REPORT, PLATELET_COUNT, IMPLANT_INVOICE, COST_ESTIMATE,
  DISCHARGE_SUMMARY, FINAL_BILL, INVESTIGATION_BILLS, OTHER.
- `checklist_rules(id, payer_id nullable, procedure_id nullable, document_type_id, stage, requirement,
  max_age_hours nullable, note, updated_by, updated_at)` unique on (payer_id, procedure_id, document_type_id, stage)
  (use NULLS NOT DISTINCT).
- `claims(id, code unique 'CLM-3381', patient_name, patient_age, patient_gender, uhid, policy_number, payer_id,
  procedure_id, treating_doctor, admitted_at, estimated_amount_paise bigint, approved_amount_paise nullable,
  status, assigned_to user id, created_at, updated_at)`
- `claim_events(id, claim_id, from_status nullable, to_status, note, actor_id, at)` — the timeline.
- `documents(id, claim_id, blob_pathname, file_name, mime_type, size_bytes, document_type_id nullable,
  ai_document_type_key nullable, ai_confidence real nullable, ai_reason text nullable, classified_by 'AI'|'USER' nullable,
  status doc_status, document_date date nullable, error text nullable, uploaded_by, uploaded_at, confirmed_by, confirmed_at)`
- `extracted_fields(id, claim_id, document_id, field_key, value, source_snippet, confidence real, status field_status,
  reviewed_by, reviewed_at)` — pre-auth form fields proposed by AI. Field keys come from a registry in code
  (`PREAUTH_FIELDS`: patient_name, age, gender, policy_number, provisional_diagnosis, icd10_code (optional),
  proposed_procedure, date_of_admission, treating_doctor, estimated_cost, clinical_history_summary, ...),
  each with label, required flag, and type.
- `queries(id, claim_id, from_address, subject, body, received_at, due_at, status, ai_summary jsonb nullable
  ({summary, asks: string[], requested_document_keys: string[], deadline_text|null}), ai_error nullable,
  reply_body nullable, answered_at, answered_by)`
- `audit_logs(id, actor_id nullable, action, entity_type, entity_id, detail jsonb, ip, at)` — append-only.

Money is stored in paise (bigint) and formatted with `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})`.
Times are stored UTC (`timestamptz`) and displayed in Asia/Kolkata.

## The checklist engine (the hard part) — `src/domain/checklist.ts`, pure, no I/O

1. **Rule resolution.** For a (payer, procedure, stage), each document type's effective rule is the most
   specific match: (payer, procedure) > (payer, any) > (any, procedure) > (any, any). The most specific rule
   wins entirely, including WAIVED (lets a TPA waive a default) and max_age_hours. Function
   `resolveRules(rules, {payerId, procedureId, stage}) → ResolvedRule[]` returns each rule with its `source`
   (which tier it came from) so the UI can explain "required because: Company B · Gall bladder removal".
2. **Evaluation.** `evaluateChecklist(resolved, documents, now) → ChecklistResult` with one slot per
   non-WAIVED rule. Slot state, a discriminated union:
   - `SATISFIED` — ≥1 CONFIRMED doc of that type that is fresh.
   - `UNVERIFIED` — docs of that type exist but none confirmed (AI-classified, NEEDS_REVIEW).
   - `STALE` — confirmed doc exists but document_date (fallback uploaded_at) older than max_age_hours.
   - `MISSING` — nothing of that type.
   Plus `unsorted` (docs with no type / FAILED / OTHER needing review) and `blockers` for submission:
   every REQUIRED slot not SATISFIED, every unsorted doc still NEEDS_REVIEW, and (for PREAUTH) every
   required pre-auth field not CONFIRMED. `ready = blockers.length === 0`. Also counts for progress.
3. **Stage for status**: PREAUTH_DRAFT/PREAUTH_SUBMITTED/QUERY → PREAUTH; APPROVED/ENHANCEMENT → ENHANCEMENT
   when status is ENHANCEMENT else DISCHARGE once moving to final bill. Keep this a table, not ifs.

## Claim lifecycle — `src/domain/claim-status.ts`, a transition table

```
PREAUTH_DRAFT --submit_preauth[gate: PREAUTH ready]--> PREAUTH_SUBMITTED
PREAUTH_SUBMITTED --record_query--> QUERY          (creating a query also moves the claim to QUERY)
QUERY --answer_query[all queries answered]--> PREAUTH_SUBMITTED
PREAUTH_SUBMITTED --record_approval--> APPROVED
APPROVED --request_enhancement--> ENHANCEMENT
ENHANCEMENT --submit_enhancement[gate: ENHANCEMENT ready]--> APPROVED
APPROVED --submit_final_bill[gate: DISCHARGE ready]--> FINAL_BILL_SUBMITTED
FINAL_BILL_SUBMITTED --record_settlement--> SETTLED
PREAUTH_SUBMITTED|QUERY|FINAL_BILL_SUBMITTED --record_rejection--> REJECTED
```
"Submit" means the desk marks it as sent through the insurer's own channel (portal/email are out of scope and
mocked). Every transition writes a `claim_events` row and an audit row. The timeline shows the five client
milestones (Pre-auth, Query, Approved, Final bill, Settled) with times, plus **hospital-side elapsed time**
against IRDAI windows: admission→pre-auth submitted vs 60 min, discharge request (final bill) wait vs 180 min,
query received→answered vs the payer reply window.

## Query deadlines

`due_at = deadline stated in the email if the AI found one, else received_at + payer.query_reply_hours`.
Countdown states: ON_TRACK (> 4h left), DUE_SOON (≤ 4h), OVERDUE (past due, still OPEN). Pure function in
`src/domain/deadline.ts`, unit tested. Replies are drafted and **marked as sent manually**; nothing is emailed.
New queries are entered via "Log incoming query" (paste the email) — the mock of a mailbox.

## AI — `src/ai/`

- `classifyAndExtract(file bytes, mime, documentTypeCatalogue)` → zod-validated
  `{ document_type_key, confidence 0..1, reason, document_date|null, fields: [{key, value, source_snippet, confidence}] }`.
  Fields only for documents that carry pre-auth data (pre-auth form, doctor notes, policy card, ID, estimate).
- `summariseQuery(subject, body, catalogue)` → `{summary, asks[], requested_document_keys[], deadline_iso|null}`.
- Behaviour: confidence < 0.75 or unknown key → stays NEEDS_REVIEW with an "AI unsure" marker; ≥ 0.75 → still
  NEEDS_REVIEW until a human confirms (one click). Fields are always PENDING until confirmed/edited. On any AI
  error/timeout/invalid JSON → document status FAILED with the error, slot unaffected, user can sort manually;
  query summary failure shows the original email and a retry button. The AI client is behind a small interface
  so tests inject a fake. Do not send PDFs larger than the model limit; images and PDFs are passed inline.
- Gemini runs after upload in the same request (with a timeout ~25s) — keep it simple; no queue.

## Screens (≈7)

1. `/login` — two demo accounts shown as one-click fill on the demo page.
2. `/claims` — worklist: search (code, patient, policy), filters (status, payer, "has gaps", "overdue"),
   columns: claim, patient, payer, procedure, status, readiness (e.g. "2 missing"), next deadline, assignee.
   Header KPI strip: open pre-auths, queries due today, overdue, claims blocked by gaps.
3. `/claims/new` — create claim (patient, payer, procedure, policy, doctor, admission, estimate).
4. `/claims/[code]` — the claim file. At a glance header: status, payer, procedure, readiness, next deadline.
   Status timeline. Gap view: checklist slots grouped by state (missing/stale/unverified first), each with
   "why required" and an upload button; drag a document card from one slot to another (misfiled fix) with
   keyboard alternative (a "Move to…" menu). Upload dropzone that sorts files into slots via AI. Primary action
   button is the next legal transition and is disabled with the blocker list when the gate fails.
5. `/claims/[code]/preauth` — pre-auth field review: each field with value, source snippet, confidence,
   Confirm / Edit / Reject; side-by-side document preview.
6. `/queries` — inbox: list sorted by due, countdown chips; detail with AI summary, asked documents linked to
   checklist slots, original email below, reply draft, "Mark reply sent".
7. `/settings/checklists` — HEAD only: pick payer + procedure + stage, see the resolved checklist with the source
   tier for each row, add/override/waive rules, max age. Plus `/settings/audit` — HEAD only audit log.

Design: restrained palette (neutral slate/zinc, one accent, red/amber only for missing/overdue), generous
white space, clear type scale, no decoration without purpose. Skeletons, empty states, error boundaries,
confirmation dialogs for transitions and waivers, toasts. Responsive down to tablet; usable on phone.

## Seed (fictional, synthetic)

Users: `desk@claimdesk.demo` (EXECUTIVE, "Priya Kulkarni"), `head@claimdesk.demo` (HEAD, "Anil Joshi"), password
documented in deployment.md. Payers: Company B (TPA), Company C (insurer), Company D (TPA), plus 2 more.
Procedures: Gall bladder removal (laparoscopic cholecystectomy), Total knee replacement, Dengue with low platelets,
plus 2. Rules showing every tier, including a waiver and a 24h max-age platelet rule. Claims:
- CLM-3381 Rajendra Pawar, Company B (TPA), gall bladder removal, QUERY, missing Ultrasound report, an open query
  asking for it.
- CLM-3382 Sunita Deshmukh, Company C (insurer), total knee replacement, PREAUTH_SUBMITTED, nothing missing.
- CLM-3385 Imran Shaikh, Company D (TPA), dengue with low platelets, ENHANCEMENT, latest platelet count missing
  (one older platelet report present that is STALE).
- 4–6 more claims across states so the worklist and KPIs are meaningful.
Synthetic PDFs generated by a script (`pdf-lib`) into `seed/files/`, stored in Postgres by the seed, every one stamped
"SYNTHETIC — FICTIONAL PATIENT". Seed is idempotent (re-runnable).

## Security / privacy

Server-enforced RBAC; audit log rows for login, logout, claim create, transition, upload, view/download of a
document, field confirm, rule change, query answer. Security headers. No PHI in logs. Rate-limit login
(simple per-IP+email counter in DB or memory). Secrets only in env. Gemini processing is a cross-border transfer —
documented as such in the design doc with the production plan.
