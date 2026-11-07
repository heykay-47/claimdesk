# Phase 3 delivery checkpoint

- Blocking first steps. Verify each priority item before committing it and starting the next. The final browser suite runs against the production build.
- Independent workstreams. The scoped implementation is owned by one subagent. No nested agent tool is available, so investigation, design, code and review run directly.
- Shared mutable state. Database changes use transactions. Demo reset locks one advisory key and restores sample children atomically. Browser mutation tests run serially and restore the demo.
- Smallest safe decomposition. Five ordered commits match the requested delivery units. Reuse existing domain authorities and mutation boundaries rather than adding a service framework.

## Design choices

- Reset is a shared callable seed rather than a spawned CLI process. Both the scheduled route and authenticated head action work in serverless environments.
- Readiness and packet cover states come from the same checklist engine. UI filters remain URL-driven.
- Deductions belong to settlement data, with a small reason registry. Insights report observed desk timestamps, not insurer compliance.
