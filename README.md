# ClaimDesk

A hospital insurance desk workspace for cashless claims, document readiness, payer queries and settlement tracking. Built for the Isocode take-home.

[Open the demo](https://isocode-claims.vercel.app) · [Run and verify locally](docs/deployment.md) · [Design and production constraints](docs/design.md)

Implementation and verification details are in the [Phase 3 handoff](docs/phase-3-report.md).

## Try the core workflow

1. Sign in with the **Desk executive** demo account on the login page.
2. Open **CLM-3381** from the claims worklist. Its ultrasound report is missing and a payer reply is overdue.
3. Upload `seed/files/CLM-3381-ULTRASOUND_REPORT.pdf`. AI suggests a slot, but readiness changes only after you confirm it.
4. Record replies to both open queries. The claim returns to **Pre-auth sent** only after the final query is answered.
5. Download the PDF packet. Its cover reports the current checklist and any remaining blockers. Nothing is sent to a payer.

Open **CLM-3385** to inspect the stale platelet report. The **Desk head** account can change scoped checklist rules and inspect the audit trail. Both roles can view timing and deduction insights.

## Run locally

Use Node.js 24 and the pinned pnpm version. Configure the service credentials described in [deployment.md](docs/deployment.md), then run:

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
pnpm dev --port 3001
```

Verification commands are `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm test:e2e` and `pnpm build`. The end-to-end suite builds the production app and restores demo data afterward. Real Gemini extraction has a separate `pnpm ai:smoke` check.

## Boundaries

All patients and documents are fictional. This demo is not approved for real patient records. The database is in Singapore, private Blob storage and application functions are in Mumbai, and AI processing can be cross-border. See the [residency and security design](docs/design.md) before production use.

Checklist precedence and lifecycle gates live in pure domain modules. Server mutations validate inputs, enforce current database roles and write audit rows. AI outputs remain suggestions until reviewed. Payer communication is always manual.
