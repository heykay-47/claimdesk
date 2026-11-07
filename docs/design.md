# Foundation design and production constraints

The insurance desk needs reliable submission checks before it needs more screens. Phase 1 keeps the checklist and lifecycle pure, with database, auth, AI, and storage adapters at their boundaries.

## Checklist decisions

`resolveRules` selects one complete rule per document type. A payer-and-procedure rule wins over payer, procedure, and default rules, in that order. A waiver removes the slot. A specific rule never inherits another rule's maximum age.

`evaluateChecklist` requires a fourth context argument with the stage and reviewed fields. The SPEC's three-argument sketch cannot detect required fields when no rules exist. Requiring context prevents an empty pre-auth rule set from bypassing the field gate.

Freshness treats a date-only report as IST midnight. This is conservative because the schema stores a date, not a collection timestamp. A future production version can store collection timestamps when source documents provide them.

Every unconfirmed unsorted upload blocks submission, including `PROCESSING` and `FAILED` files. This extends the SPEC's explicit `NEEDS_REVIEW` blocker. Failed processing must not make the claim appear ready.

`APPROVED` maps to the discharge checklist. `ENHANCEMENT` maps to its own checklist. Rejected claims use the pre-auth checklist for inspection and have no legal next action. A final-bill rejection's earlier discharge history remains in the event log.

## Auth and audit

The HS256 session contains only a user ID, issuance time, expiry, issuer, and audience. Each protected server operation loads the current user and role from Postgres. A changed role takes effect without waiting for the eight-hour session to expire.

The cookie is HTTP-only, same-site lax, and secure in production. Proxy verifies the signature for page navigation. Server functions and file routes enforce their own authorization.

The login limit allows five attempts per IP and email pair, plus thirty attempts per IP, in fifteen minutes. Counters are process-local and reset on restart. A production deployment needs a shared rate-limit store and trusted proxy configuration.

`audit()` only inserts rows. Application code never edits or deletes an audit row. Production database credentials should have insert-only permission on `audit_logs`. Database-owner credentials remain necessary for local migrations and isolated integration tests, not for a hardened application role.

## AI and private files

The Gemini adapter uses an explicit response schema and validates JSON with Zod. Files are limited to 10 MB. Requests time out after 25 seconds and do not retry automatically. Lower reasoning effort reduces unnecessary work on extraction requests. The model name is configurable.

`classifyForReview` always returns `NEEDS_REVIEW` on success. Proposed fields remain `PENDING`. Low confidence and unknown catalogue keys add an `AI unsure` marker. Failures return `FAILED` with a safe error message, no document type, and no proposed fields. Query failure returns no summary and an error so the caller can keep the original email visible.

The query AI contract returns `deadline_iso`. Persist it as `queries.due_at` through `queryDueAt`; otherwise use the payer's reply window. The JSON summary's `deadline_text` is presentation metadata, not the authoritative deadline.

Private Blob pathnames stay on the server. The authenticated file route checks the session, looks up the document, reads a private stream, and inserts a view or download audit row. Responses disable browser caching and allow only same-origin framing for the later document review screen.

## Residency and privacy

The take-home environment uses a Singapore Neon database and Mumbai private Blob storage. Gemini processing can transfer data outside India. These choices do not satisfy the problem statement's India-hosting requirement for real patient records.

Every seeded patient and record is fictional. Each generated file carries `SYNTHETIC — FICTIONAL PATIENT`. No production use or legal compliance is claimed.

Before accepting real records, move Postgres to an approved India region, pin application compute and file storage to India, and select an AI processing arrangement that meets the hospital's residency and contractual requirements. If no approved AI service is available, disable AI and keep manual classification and field entry available. Complete the hospital's privacy and legal review, processor agreements, retention and deletion policy, access review, and incident response process before launch.

## Work checkpoint

- Blocking first steps were the SPEC, installed Next.js guides, library documentation, and schema migration.
- The independent work was pure domain testing, synthetic file generation, and external-service checks.
- Postgres migrations and seed writes were serialized. Integration writes use a separate schema and transaction.
- One implementation owner kept the cross-module contracts consistent. No repository or service layers were added.
