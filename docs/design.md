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

The login limit counts only failed attempts: five per IP and email pair, plus thirty per IP, in fifteen minutes. A successful sign-in clears that pair's counter. Successful sign-ins never count, because reviewers share the demo accounts and often an office IP. Counters are process-local and reset on restart. A production deployment needs a shared rate-limit store and trusted proxy configuration.

`audit()` only inserts rows. Application code never edits or deletes an audit row. Production database credentials should have insert-only permission on `audit_logs`. Database-owner credentials remain necessary for local migrations and isolated integration tests, not for a hardened application role.

## AI and private files

The Gemini adapter uses an explicit response schema and validates JSON with Zod. Uploads are limited to 4 MB. Phase 2 supersedes the original single-model 25-second timeout with an overall 45-second budget shared between the primary model and configured fallbacks. Only transient 429, 503, 504, unavailable and timeout failures permit fallback. Invalid request or output validation errors stop immediately. The document’s AI reason records the answering model. A model that fails transiently is skipped for five minutes on that instance, so an exhausted quota costs one fast 429 instead of a wait on every upload.

`classifyForReview` always returns `NEEDS_REVIEW` on success. Proposed fields remain `PENDING`. Low confidence and unknown catalogue keys add an `AI unsure` marker. Failures return `FAILED` with a safe error message, no document type, and no proposed fields. Query failure returns no summary and an error so the caller can keep the original email visible.

The query AI contract returns `deadline_iso`. Persist it as `queries.due_at` through `queryDueAt`; otherwise use the payer's reply window. The JSON summary's `deadline_text` is presentation metadata, not the authoritative deadline.

Uploads use one authenticated, same-origin multipart POST. The server validates the claim ID, file size and PDF/PNG/JPEG/WebP MIME allowlist, then stores metadata, bytes and an audit row in one transaction. AI classification uses the same in-memory bytes after commit. Large photos are resized in the browser to at most 2000 pixels on the longest side and encoded as JPEG at 0.85 quality. Files still above 4 MB, including PDFs, are rejected with instructions to compress them. Migration 0003 adds the file table without changing existing document columns.

The authenticated file route checks the session, looks up the document, reads its bytes from Postgres, and inserts a view or download audit row. Responses disable browser caching and allow only same-origin framing. No public file URL or database credential reaches the browser. Previews and downloads only use the authenticated application route.

## Patient identity checks

`src/domain/identity.ts` compares extracted patient names, policy numbers, and UHIDs with the claim. The result is `MATCH`, `MISMATCH`, or `UNKNOWN`. The matcher makes no provider request. Names use Unicode normalization, case-insensitive token sets, punctuation normalization, and the six supported honorifics. Reordered names match. Initials can be omitted when two full-name tokens agree. Different full-name tokens, including an additional expanded middle name, require human review. Meaningful Indian-script vowel marks are preserved. Identifiers ignore case, spacing, and punctuation. Every extracted identifier must agree.

The document stores original identity values and source snippets separately from editable pre-auth fields. Migration `0002_high_newton_destine.sql` snapshots existing extracted evidence. New AI results retain identity evidence from all document types, including reports. Pre-auth candidate fields remain limited to the original eligible types. A late extraction stores identity evidence even when a person has already chosen the document's slot. It does not overwrite that choice or confirmation.

A persisted mismatch flag was rejected because it could become stale. Comparing only editable field values was rejected because a field edit or rejection could hide the original contradiction. The chosen design compares immutable evidence at evaluation time. A separate override records the actor and time. The checklist engine adds identity blockers before other blockers, excludes these documents from slot satisfaction, and excludes their fields from pre-auth readiness. Packet export uses the same identity decision for attachments and confirmed cover values.

Normal document confirmation and field confirmation reject an unresolved mismatch on the server. The explicit same-patient action confirms the document and appends `DOCUMENT_IDENTITY_OVERRIDE` with the actor and compared evidence. Moving a document or rejecting a field does not remove the mismatch. Removal requires confirmation, sets `removed_at` and `removed_by`, and appends `DOCUMENT_REMOVE`. Removed documents and their values disappear from claim views and checklist evaluation. Their private file route returns 404. File bytes remain until the document row is physically deleted, at which point the foreign key cascades deletion.

`UNKNOWN` is not a positive identity verification. Documents without readable identity remain subject to normal human confirmation. Spelling variants, aliases, and transliteration require a person to inspect the source. The synthetic demo remains unsuitable for real patient records without the privacy work below.

## Workspace mutations and interface

Mutations authenticate the current database user and parse inputs with Zod. Claim changes lock the claim row. Gates are evaluated from transaction-loaded documents, rules and reviewed fields, not client-provided status. Changes, lifecycle events and audit rows commit together. A reply closes only its own query; only the final open query returns a Query claim to Pre-auth sent. Human document corrections are not overwritten by an AI request that finishes later.

Ordinary database queries use the Neon Pool driver’s HTTP-query mode. Interactive transactions use its WebSocket connection. This avoids retaining idle sockets for independent worklist reads while retaining atomic claim mutations.

The worklist uses URL filters and a compact KPI strip. The claim file shows its first blocker and next query deadline above the timeline. Missing, stale and unverified slots lead, and satisfied documents are collapsed. Rule-source explanations are keyboard-accessible disclosures. A Move to menu is the keyboard alternative to document dragging. The mobile layout puts the next action before the longer file content.

The visual system uses stone surfaces, 1 px borders, Geist sans, mono numerals, and deep teal for action and focus. Red, amber and emerald communicate blocked, review and satisfied states. There are no decorative illustrations or animations. Loading skeletons, empty states, retry boundaries, confirmation dialogs and result toasts cover the primary surfaces.

## Residency and privacy

The take-home environment uses a Singapore Neon database for records and document bytes, with application functions in Mumbai. Gemini processing can transfer data outside India. These choices do not satisfy the problem statement's India-hosting requirement for real patient records.

Every seeded patient and record is fictional. Each generated file carries `SYNTHETIC — FICTIONAL PATIENT`. No production use or legal compliance is claimed.

Before accepting real records, move Postgres to an approved India region, pin application compute and file storage to India, and select an AI processing arrangement that meets the hospital's residency and contractual requirements. If no approved AI service is available, disable AI and keep manual classification and field entry available. Complete the hospital's privacy and legal review, processor agreements, retention and deletion policy, access review, and incident response process before launch.

## Work checkpoint

- Blocking first steps were the SPEC, installed Next.js guides, library documentation, and schema migration.
- The independent work was pure domain testing, synthetic file generation, and external-service checks.
- Postgres migrations and seed writes were serialized. Integration writes use a separate schema and transaction.
- One implementation owner kept the cross-module contracts consistent. No repository or service layers were added.
