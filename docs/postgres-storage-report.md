# Postgres file storage verification

ClaimDesk now stores document bytes in Postgres instead of the suspended Blob store. The local production app previews seeded files, accepts a single multipart upload, classifies it with real Gemini, and downloads the claim packet. No push or deployment was performed.

## Storage and upload changes

- `src/db/schema.ts` adds `document_files` with a document ID primary key, a cascading document foreign key, and non-null `bytea` content.
- `drizzle/0003_lively_susan_delgado.sql`, `drizzle/meta/0003_snapshot.json`, and `drizzle/meta/_journal.json` record the generated migration. It only adds the table and foreign key. Existing document columns and rows remain intact. New rows keep a synthetic `postgres/<document-id>` value in the unchanged `blob_pathname` column.
- `src/server/storage.ts` writes bytes using the caller's transaction and reads bytes and MIME type by document ID. Preview, packet export, and AI retry callers no longer use storage paths.
- `src/server/upload.ts` replaces `src/server/direct-upload.ts`. It checks the session, claim ID, file name, MIME allowlist, and 4 MB limit. Metadata, file bytes, and the upload audit row commit together. AI processing uses the in-memory bytes after commit. Existing processing, failure, confirmation, and identity rules remain in `src/server/mutations.ts`.
- `src/app/api/documents/upload/route.ts` accepts one multipart POST with `claimId` and `file`, keeps the origin check and 60-second route budget, and revalidates the workspace.
- `src/app/api/documents/[id]/file/route.ts` retains session checks, removal checks, view/download audits, and `Cache-Control: private, no-store`. No public file URL exists.
- `src/app/api/claims/[code]/packet/route.ts` reads bytes from Postgres and retains the existing file, byte, and page limits.
- `src/domain/document-upload.ts` owns the shared limit, MIME allowlist, and oversized-file message.
- `src/components/workspace/upload-zone.tsx` keeps per-file progress and refresh-after-error behavior. Large images are resized to at most 2000 pixels on the longest side and encoded as JPEG at 0.85 quality before upload. PDFs over 4 MB receive the compression message.
- `seed/run.ts` generates PDFs in memory and writes their bytes inside the reset transaction. `scripts/seed.ts` no longer mentions Blob credentials. `e2e/global-teardown.ts` removes only run-owned claims and relies on document deletion and reseeding to cascade file cleanup.
- `package.json` and `pnpm-lock.yaml` remove `@vercel/blob` and its unused dependencies. No code or current setup guide requires a Blob token.
- `README.md`, `docs/SPEC.md`, `docs/deployment.md`, `docs/design.md`, and `docs/technical-design.md` describe Postgres file storage, the 4 MB limit, and Singapore storage residency. Earlier phase reports remain historical records.

## Migration gate

`pnpm db:generate` generated migration 0003. Before changing the shared database, `pnpm exec tsx scripts/verify-storage-migration.ts` passed migrations 0000 through 0003 in a unique schema inside a transaction. It verified a binary round trip containing zero and high bytes, preservation of a legacy pathname, and cascade deletion. The transaction was rolled back.

Only after that check passed, `pnpm db:migrate` applied migration 0003 to the shared Neon database. `pnpm db:seed` recreated all 66 seeded files in Postgres before the test suite.

## Automated checks

Every command below returned exit code 0.

- `pnpm lint` passed.
- `pnpm exec tsc --noEmit` passed.
- `pnpm test` passed 132 tests across 13 files.
- `pnpm test:e2e` passed all five serial production-build journeys. Its server alone used fake AI. No journey selector changes were needed.
- `pnpm build` passed after the end-to-end run.
- `pnpm storage:smoke` passed a 2725-byte PDF SHA-256 round trip inside a rolled-back transaction.
- `pnpm exec vitest run tests/packet.test.ts` passed all five packet tests after removing the obsolete database mock.
- `git diff --check` passed.

`tests/mutations.integration.test.ts` now uses real file storage rather than a storage mock. It covers authenticated view/download byte equality and audits, rejection of files over 4 MB and unsupported MIME types, origin/session denial, rollback of both rows when the audit insert fails, cascade deletion, and foreign-key rejection of orphan file rows. `tests/packet.test.ts` uses document IDs and byte-returning storage mocks. `scripts/storage-smoke.ts` and `scripts/verify-storage-migration.ts` are repeatable storage checks.

## Real browser evidence

The browser used Chromium against `pnpm start --port 3013` after the final production build. This server did not use the end-to-end fake-AI setting.

1. Signed in as the desk executive and opened CLM-3381. Expanded its seeded documents and previewed `CLM-3381-POLICY_CARD.pdf`. The PDF rendered. An authenticated fetch returned 200, `application/pdf`, `private, no-store`, and 2439 bytes. Its SHA-256 was `38dbe970da4133e38b39df15d8939cb1d6b0b7eda2f3e6e9bd0f0593bedc739f`. [Seeded PDF preview](screenshots/postgres-seeded-preview.png).
2. Uploaded `seed/files/CLM-3381-ULTRASOUND_REPORT.pdf` renamed to `claimdesk-postgres-real-ultrasound.pdf` through the file input. Real `gemini-3.5-flash` classified it as `ULTRASOUND_REPORT` at 99% confidence. It appeared in the Ultrasound slot as `NEEDS_REVIEW`, not confirmed. [Ultrasound slot after real Gemini](screenshots/postgres-real-gemini-ultrasound.png).
3. Read the stored upload through the ordinary database connection and compared it with the source file. Both were 2610 bytes with SHA-256 `af3704dab241bfe2914355a164ef7bb0e6592b688e4ec027a953fc1587146e62`. The document had `DOCUMENT_UPLOAD` and `DOCUMENT_AI` audit rows and recorded the answering model.
4. Confirmed the ultrasound through the UI. The claim became Ready to submit. Download packet saved `/tmp/opencode/postgres-clm3381-packet.pdf`. Parsing the actual download produced seven pages, 12816 bytes, and title `CLM-3381 PREAUTH packet`.
5. Tested large-image preparation separately with only the upload response intercepted, so this UI-only check did not save a photo or invoke Gemini. A 3000 by 2000 PNG of 18682474 bytes became a 2000 by 1333 JPEG of 1612753 bytes named `large-phone-photo.jpg`. The interception was then removed.
6. Selected a PDF of 4 MB plus one byte. The UI displayed `This file is larger than 4 MB. Compress it or upload a smaller scan.` without uploading it.

One packet request failed with a Neon `ENETUNREACH` fetch error. Retrying downloaded the verified PDF. The failure occurred in the existing claim lookup, not file decoding. No unrelated network retry policy was added.

## Clean demo and remaining limits

After the browser checks, `pnpm db:seed` restored the demo. A database assertion confirmed 10 claims, 66 documents, 66 stored files, 110 extracted fields, three queries, and 66 identity snapshots. There were zero missing files, zero byte-length mismatches, zero end-to-end claims, and zero copies of the renamed browser upload. Audit history remains.

The live deployment remains on the older code until the owner deploys. This migration cannot recover non-seeded bytes from the suspended store. Those files require re-upload. Existing metadata is preserved. Postgres remains in Singapore, so the demo is still unsuitable for real patient records under the India-residency requirement.

## Principles used

- Model the Domain put the one-file-per-document rule in the primary key and cascading foreign key.
- Laziness Protocol kept the legacy column unchanged and deleted the token handshake rather than maintaining two storage paths.
- Prove It Works required isolated migration checks, real stored-byte comparisons, production journeys, and real-Gemini browser evidence before handoff.
