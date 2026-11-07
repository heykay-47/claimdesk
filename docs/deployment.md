# Run the ClaimDesk foundation

Phase 1 includes credentials auth, the database and domain, AI clients, private document storage, and synthetic records. Product screens belong to Phase 2.

## Configure local services

Use Node.js 24 and the pinned pnpm version in `package.json`.

1. Create `.env.local` with `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BLOB_READ_WRITE_TOKEN`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and `SESSION_SECRET`.
2. Use a private Vercel Blob store. Set a random session secret of at least 32 characters.
3. Run `pnpm install --frozen-lockfile`.
4. Run `pnpm db:migrate`.
5. Run `pnpm seed:files` if you change the fixture generator. The generated files are committed.
6. Run `pnpm db:seed`.
7. Run `pnpm dev --port 3001`.

The seed updates only its deterministic demo records. Rerunning it resets those records and refreshes query deadlines relative to the current time. Blob paths remain stable. Do not use this seed against real patient data.

## Sign in

Both demo accounts use `ClaimDesk@2026`.

- `desk@claimdesk.demo` is Priya Kulkarni, an `EXECUTIVE`.
- `head@claimdesk.demo` is Anil Joshi, the `HEAD`.

The login page has buttons that fill these credentials. The home page displays the authenticated name and role.

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

`storage:smoke` uploads a synthetic PDF and compares SHA-256 hashes after a private read. `ai:smoke` prints validated classifications for a synthetic PDF and a handwritten-style PNG. It exits nonzero on provider failures without printing credentials or request data. `AI_SMOKE_TIMEOUT_MS` changes only the diagnostic script's timeout. The application timeout remains 25 seconds.

## Prepare a deployment

Set the same environment variable names in the deployment project. Use a new session secret for each deployment environment. Keep migrations as an explicit release step rather than running them in the application build.

The current provisioned database is in Singapore. This demo is **not approved for real patient records**. See [the security and residency design](design.md) before production use.
