# Run ClaimDesk

ClaimDesk includes the claims worklist and claim file, checklist review, private uploads, pre-auth field review, query inbox, head-only checklist management, and an audit log. Nothing is sent to a payer automatically.

## Configure local services

Use Node.js 24 and the pinned pnpm version in `package.json`.

1. Create `.env.local` with `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BLOB_READ_WRITE_TOKEN`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and `SESSION_SECRET`. Optionally set `GEMINI_FALLBACK_MODELS` to a comma-separated list of permitted fallback models.
2. Use a private Vercel Blob store. Set a random session secret of at least 32 characters.
3. Run `pnpm install --frozen-lockfile`.
4. Run `pnpm db:migrate`.
5. Run `pnpm seed:files` if you change the fixture generator. The generated files are committed.
6. Run `pnpm db:seed`.
7. Run `pnpm dev --port 3001`.

The seed restores its deterministic sample claims, documents, fields, queries and timeline, plus all checklist rules. Admission times, report dates and query deadlines are relative to the seed run. Independently created claims and append-only audit rows are kept. Blob paths remain stable. Do not use this seed against real patient data.

## Sign in

Both demo accounts use `ClaimDesk@2026`.

- `desk@claimdesk.demo` is Priya Kulkarni, an `EXECUTIVE`.
- `head@claimdesk.demo` is Anil Joshi, the `HEAD`.

The login page has buttons that fill these credentials. `/` redirects to `/claims`. The user menu shows the current name and role and contains Sign out. Only the head sees Checklist rules and Audit log in the navigation; the server checks the role independently.

## Verify changes

Run these commands:

```sh
pnpm lint
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm storage:smoke
pnpm ai:smoke
```

Integration tests require the seeded database. They create a unique schema inside a transaction, copy the demo fixtures into it, and roll back the entire transaction. They never update or delete the demo records. AI tests use a fake client.

`storage:smoke` uploads a synthetic PDF and compares SHA-256 hashes after a private read. `ai:smoke` prints validated classifications for a synthetic PDF and a handwritten-style PNG, followed by an explicit N/2 result. Either file failing means exit code 1. Printing an error for one file and a successful result for another is not a passing smoke test.

Gemini tries `GEMINI_MODEL` first, then `GEMINI_FALLBACK_MODELS` in order for transient 429, 503, 504, unavailable, or timeout failures. Structured-output validation and non-transient request errors do not fall back. The overall budget is 45 seconds, shared between configured models. `AI_SMOKE_TIMEOUT_MS` caps each smoke attempt without removing that overall budget. The answering model is included in the document’s AI reason.

Use `seed/files/CLM-3381-ULTRASOUND_REPORT.pdf` to demonstrate the missing-report flow. It is intentionally not attached by the seed. Upload it to CLM-3381, inspect the AI suggestion, confirm it, and record replies to both open queries. The first reply keeps the claim in Query; the last returns it to Pre-auth sent.

## Prepare a deployment

Set the same environment variable names in the deployment project. Use a new session secret for each deployment environment. Keep migrations as an explicit release step rather than running them in the application build.

Set Node.js 24 for the deployment runtime. Private uploads go directly from the browser to Vercel Blob with a server-issued five-minute token restricted to one path, MIME type and file size, with overwriting disabled. The server verifies the completed private object and processes AI synchronously with a 60-second route budget. File bytes do not pass through the deployment’s request-body limit. Preview and download still go exclusively through the authenticated file route. The client never receives the read-write store token.

Set `CRON_SECRET` to a random secret in Vercel. The scheduled `/api/cron/reset-demo` GET requires `Authorization: Bearer <CRON_SECRET>` and resets daily at 21:30 UTC, around 03:00 IST. A missing secret denies access. The desk head can also use the confirmed Reset demo data action on `/settings/audit`. Both entry points use the same transactional seed and append a `DEMO_RESET` audit row. Bundled fixture PDFs are included in Next.js file tracing. No reset writes to the function filesystem.

After a browser test, remove only independently created test claims before reseeding. The seed removes changed or added children of sample claims and restores all checklist rules. Audit rows are preserved.

The current provisioned database is in Singapore. This demo is **not approved for real patient records**. See [the security and residency design](design.md) before production use.
