# Patient identity guard

ClaimDesk now prevents an extracted wrong-patient identity from satisfying a claim's checklist or entering its packet without an audited human override. No push or deployment was performed.

## Reproduction and fix

The real-Postgres upload regression first reproduced the defect. Rajendra Pawar's claim became ready after its missing ultrasound was confirmed. Uploading a fake-AI admission note for Imran Shaikh incorrectly left it ready. The failing assertion was:

```text
AssertionError: expected true to be false // Object.is equality
```

`src/domain/identity.ts` now returns `MATCH`, `MISMATCH`, or `UNKNOWN`. It compares names, policy numbers, and UHIDs without another AI request. Names tolerate case, spacing, punctuation, supported honorifics, reordering, and omitted initials when two full-name tokens agree. Expanded or different full-name tokens require review. Unicode vowel marks remain meaningful. No spelling, alias, or transliteration guesses are made.

`documents.identity_evidence` preserves original values and source snippets independently of mutable pre-auth suggestions. Migration `0002_high_newton_destine.sql` adds the evidence, override actor and time, and removal actor and time. It snapshots existing extracted identity evidence. The additive migration passed isolated-schema tests and was applied to the configured demo database. The seed now provides immutable patient-name evidence for every synthetic document.

The shared checklist engine puts identity blockers first and excludes mismatched documents and their confirmed fields from readiness. Worklists, claim headers, stage gates, and packet covers use that result. Normal confirmation, a slot move, a field edit, or field rejection cannot clear the mismatch. A late AI extraction still records identity evidence after a human move or confirmation, without overwriting the chosen slot. Repeated completion does not call AI again for a processed document.

The document card shows the red found-versus-claim warning and exact source snippet. The explicit same-patient action confirms the document and records `DOCUMENT_IDENTITY_OVERRIDE` with the actor and compared evidence. Removal requires a confirmation dialog and records `DOCUMENT_REMOVE`. Removed documents and their values disappear from claim views. Their authenticated private file route returns 404.

Pre-auth review shows the same warning and excludes all candidate values from unresolved sources, including patient name, age, and gender. Server mutations independently reject field confirmation from those sources. Packet export excludes even previously confirmed mismatched attachments and their values. Its cover retains the identity blocker. Extracted `M`, `F`, and equivalent case variants normalize to `Male` and `Female`. `O` and `other` normalize to `Other`. Unknown values are not guessed.

## Verification

Observed on 7 November 2026:

- `pnpm lint` passed.
- `pnpm exec tsc --noEmit` passed.
- `pnpm test` passed 129 tests across 13 files. The captured shell exit code was 0. Coverage includes Indian names, identifier contradictions, Unicode vowel marks, fake-AI uploads, blocked normal confirmation and field review, slot moves, rejected evidence, audited override, removal, private-file denial, late extraction, and packet exclusions.
- `pnpm test:e2e` passed all five serial journeys against a fresh production build. The final run reported `5 passed (4.0m)`.
- `pnpm build` passed independently after the last source edit.
- `pnpm exec tsx scripts/verify-patient-identity.ts` passed against the final production artifact on port 3012. It verified the desktop and mobile warning, excluded pre-auth values, audited removal and override, and private-file 404. It removed only its own temporary document records and retained audit history. Its fixtures reused an existing synthetic private object, so no new blob required cleanup.
- The Impeccable detector returned `[]` for the changed UI. Desktop width was 1440 px and phone width was 390 px, with no horizontal page overflow.
- `git diff --check` passed.

`docs/screenshots/patient-mismatch-desktop.png` shows the warning on CLM-3381. The phone inspection capture is `/tmp/opencode/patient-mismatch-mobile.png`. The normal claim-file layout did not change, so its existing captures were retained.

The final `pnpm db:seed` passed. Aggregate checks found 10 claims, 66 documents, 110 extracted fields, three queries, 66 identity snapshots, no removed sample documents, and no E2E claims. Temporary warning fixtures are gone.

## Boundaries and implementation choices

The checker makes no extra AI call. Identity extraction is requested in the existing classification call. `UNKNOWN` does not prove identity and still requires normal human document review. Documents without readable identity and spelling or transliteration differences still need desk judgment.

Removal is a soft removal. The private object remains under the existing retention boundary and is no longer served by the application. Production object-retention cleanup remains outside this change. The application remains a synthetic-only demo under the residency and privacy constraints in `docs/design.md`.

One implementation owner kept the domain, database, and UI contracts aligned. Independent reads and local checks ran in parallel. Database migration, resets, browser fixtures, and E2E writes were serialized. A persisted mismatch boolean was rejected because it could become stale. Editable evidence alone was rejected because a review could erase the contradiction.

Model the Domain kept the comparison and blocker decision in shared typed structures. Prove It Works required a failing upload regression followed by real database, production browser, private-file, and packet checks.
