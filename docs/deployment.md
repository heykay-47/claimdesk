# Run ClaimDesk

ClaimDesk includes the claims worklist and claim file, checklist review, private uploads, pre-auth field review, query inbox, head-only checklist management, and an audit log. Nothing is sent to a payer automatically.

Live demo: <https://isocode-claims.vercel.app>. Repository: <https://github.com/heykay-47/claimdesk>.

## Deployment architecture

| Part | Service | Region |
| --- | --- | --- |
| Next.js app (pages, server actions, route handlers) | Vercel, project `isocode-claims`, `vercel.json` pins functions to `bom1` | Mumbai |
| Postgres | Neon (pooled URL for the app, direct URL for migrations) | Singapore (`aws-ap-southeast-1`) |
| Document files | Postgres `document_files.content`, private bytes written with the document in one transaction | Singapore (`aws-ap-southeast-1`) |
| AI | Google Gemini API, called only from the server | Google-managed |
| Daily demo reset | Vercel Cron, `30 21 * * *` UTC (03:00 IST) → `GET /api/cron/reset-demo` with a bearer secret | Mumbai |

Pushes to `main` on GitHub deploy to production. Migrations are a separate release step (`pnpm db:migrate`) and never run in the build.

## Environment variables

Secret values are not in the repository. Set each variable for Production and Preview in Vercel, and in `.env.local` for local work.

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Pooled Postgres URL used by the app |
| `DATABASE_URL_UNPOOLED` | Yes, for migrations, seed and integration tests | Direct Postgres URL |
| `SESSION_SECRET` | Yes | At least 32 random characters. Signs session cookies. Use a different value per environment |
| `GEMINI_API_KEY` | Yes | Google AI Studio key, used only on the server |
| `GEMINI_MODEL` | No | Primary model. The demo uses `gemini-3.5-flash` |
| `GEMINI_FALLBACK_MODELS` | No | Comma-separated fallbacks for 429, 503, 504 or timeouts. The demo uses `gemini-2.5-flash,gemini-3.8-flash` |
| `CRON_SECRET` | Yes, on Vercel | Bearer secret for `/api/cron/reset-demo`. If it is missing, the route denies every request |
| `AI_PROVIDER` | Never in deployment | `fake` is set only for the local Playwright server |

## Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| Desk executive (`EXECUTIVE`) | `desk@claimdesk.demo` | `ClaimDesk@2026` |
| Desk head (`HEAD`) | `head@claimdesk.demo` | `ClaimDesk@2026` |

## Configure local services

Use Node.js 24 and the pinned pnpm version in `package.json`.

1. Create `.env.local` with `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and `SESSION_SECRET`. Optionally set `GEMINI_FALLBACK_MODELS` to a comma-separated list of permitted fallback models.
2. Set a random session secret of at least 32 characters.
3. Run `pnpm install --frozen-lockfile`.
4. Run `pnpm db:migrate`.
5. Run `pnpm seed:files` if you change the fixture generator. The generated files are committed.
6. Run `pnpm db:seed`.
7. Run `pnpm dev --port 3001`.

The seed restores its deterministic sample claims, documents, file bytes, fields, queries and timeline, plus all checklist rules. Admission times, report dates and query deadlines are relative to the seed run. Independently created claims and append-only audit rows are kept. Files are generated in memory and written inside the reset transaction. Do not use this seed against real patient data.

## Sign in

Both demo accounts use `ClaimDesk@2026`.

- `desk@claimdesk.demo` is Priya Kulkarni, an `EXECUTIVE`.
- `head@claimdesk.demo` is Anil Joshi, the `HEAD`.

The login page has buttons that fill these credentials. `/` redirects to `/claims`. The user menu shows the current name and role and contains Sign out. Only the head sees Checklist rules and Audit log in the navigation; the server checks the role independently.

## Verify changes

On a claim file, Download packet builds the claim's current-stage PDF. The cover lists readiness blockers, effective checklist states, confirmed pre-auth fields, preparation time and person. Confirmed files follow in checklist order, then other confirmed files. Incomplete packets remain available with a warning. Downloads require a session, disable caching and write `PACKET_DOWNLOAD` audit rows. Unreadable files fail the export rather than disappearing from it. Exports are limited to 100 files, 50 MB of inputs and 300 pages. No packet is sent to a payer.

`/insights` is available to both roles. Pending-decision waits start at the latest recorded pre-auth or final-bill submission, with hospital preparation shown separately. Claims in Query are excluded from pending payer decisions. The 60-minute and 180-minute references do not prove insurer receipt, complete documentation or SLA compliance. Same-day query performance uses IST calendar days and answered queries with timestamps. Unrecorded deductions are excluded rather than counted as zero.

Migration `0001_first_terror.sql` adds nullable settlement amount and paired deduction amount/reason columns. Money remains integer paise. Run `pnpm db:migrate` before starting this version. Settlement can capture one optional deduction reason and positive amount. The seed includes three settled claims with room-rent, co-pay and non-payable deductions. Existing settled records remain valid with null captures.

Run these commands:

```sh
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm test:e2e
pnpm build
pnpm storage:smoke
pnpm ai:smoke
```

Integration tests require the seeded database. They create a unique schema inside a transaction, copy the demo fixtures into it, and roll back the entire transaction. They never update or delete the demo records. AI tests use a fake client.

`test:e2e` builds and starts the production artifact on port 3010, then runs five serial Chromium journeys against the configured real database, including stored files. Run `pnpm exec playwright install chromium` once. Set `E2E_PORT` to change the port. The test server alone receives `AI_PROVIDER=fake`; otherwise the app uses Gemini. Do not set `AI_PROVIDER=fake` in a deployed environment. This deterministic fake recognises the end-to-end ultrasound fixture and still requires human confirmation.

Global setup restores sample data before the journeys. Global teardown removes only claims and private uploads identified by that run's random ID, then reseeds. Audit rows remain. The suite covers uploads and confirmation, both query replies, executive HTTP 403 and server-action rejection, head waivers and requirements, blocked new claims, PDF downloads and executive insights access.

To refresh screenshots after a clean seed, run a production server on port 3011 and run `pnpm screenshots`. `SCREENSHOT_BASE_URL` can select a different local server. The capture script signs in through the UI, saves eleven desktop/mobile screenshots and fails on horizontal page overflow.

`storage:smoke` writes a synthetic PDF in a transaction, compares SHA-256 hashes after a read and rolls the transaction back. `ai:smoke` prints validated classifications for a synthetic PDF and a handwritten-style PNG, followed by an explicit N/2 result. Either file failing means exit code 1. Printing an error for one file and a successful result for another is not a passing smoke test.

Gemini tries `GEMINI_MODEL` first, then `GEMINI_FALLBACK_MODELS` in order for transient 429, 503, 504, unavailable, or timeout failures. Structured-output validation and non-transient request errors do not fall back. The overall budget is 45 seconds, shared between configured models. `AI_SMOKE_TIMEOUT_MS` caps each smoke attempt without removing that overall budget. The answering model is included in the document’s AI reason.

Use `seed/files/CLM-3381-ULTRASOUND_REPORT.pdf` to demonstrate the missing-report flow. It is intentionally not attached by the seed. Upload it to CLM-3381, inspect the AI suggestion, confirm it, and record replies to both open queries. The first reply keeps the claim in Query; the last returns it to Pre-auth sent.

## Prepare a deployment

The AI adapter explicitly uses Gemini API `v1beta`. SDK 3 defaults to `v1`, which currently rejects the system instruction used by the extraction request.
Gemini 3 requests use a low thinking level. A configured Gemini 2.5 fallback receives a 1,024-token thinking budget instead, because that model family rejects thinking-level options.

Set the same environment variable names in the deployment project. Use a new session secret for each deployment environment. Keep migrations as an explicit release step rather than running them in the application build.

Set Node.js 24 for the deployment runtime. Uploads use one authenticated multipart POST with same-origin checks. Each file is limited to 4 MB so the request stays below Vercel's 4.5 MB body limit. Large photos are resized to at most 2000 pixels on the longest side and encoded as JPEG at 0.85 quality before upload. PDFs over 4 MB must be compressed by the user. The server saves document metadata, bytes and the upload audit row in one transaction, then processes AI synchronously with a 60-second route budget. Preview and download go exclusively through the authenticated file route with private, no-store responses. No public file URL exists.

Migration `0003_lively_susan_delgado.sql` only adds `document_files` with a cascading document foreign key and non-null `bytea` content. It preserves `documents.blob_pathname` and all existing rows. New rows use a synthetic `postgres/<document-id>` key in that legacy column. Before applying the migration to the shared database, run `pnpm exec tsx scripts/verify-storage-migration.ts` to verify the migrations and binary round trip inside an isolated schema that is rolled back. Then run `pnpm db:migrate` and `pnpm db:seed`. Existing non-seed files in the suspended store cannot be recovered by this migration and must be uploaded again.

Set `CRON_SECRET` to a random secret in Vercel. The scheduled `/api/cron/reset-demo` GET requires `Authorization: Bearer <CRON_SECRET>` and resets daily at 21:30 UTC, around 03:00 IST. A missing secret denies access. The desk head can also use the confirmed Reset demo data action on `/settings/audit`. Both entry points use the same transactional seed and append a `DEMO_RESET` audit row. The seed imports the same PDF renderer as `seed:files` and generates current-dated files in memory. No reset reads or writes the function filesystem. Committed PDFs remain available as upload examples and smoke inputs.

After a browser test, remove only independently created test claims before reseeding. The seed removes changed or added children of sample claims and restores all checklist rules. Audit rows are preserved.

The current provisioned database is in Singapore. This demo is **not approved for real patient records**. See [the security and residency design](design.md) before production use.
