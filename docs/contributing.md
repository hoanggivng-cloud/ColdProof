# Contributing

Branches: `main` is release-ready, `develop` is integration. Do not push directly to main. Configure GitHub branch protection and required CI/code-owner reviews after publication; this local scaffold cannot enforce server rules.

Create feature branches from develop:

```text
feat/tv1-parser-format-a
feat/tv1-zenodo-adapter
feat/tv2-scenario-builder
feat/tv2-exception-engine
feat/tv3-batch-detail
feat/tv3-import-console
feat/tv4-report-service
feat/tv4-e2e
fix/<scope>-<description>
```

PRs target develop and include requirement/issue ID, description, files/modules affected, test evidence, screenshot/API output when applicable, migration note for schema changes, and claim-boundary check. Small PRs should stay inside module ownership; changes to shared contracts require consumers to review. Avoid parallel edits to Prisma schema without coordination.

Before requesting review: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. If a check is blocked, state the actual reason and leave it pending. TODO tests are never a pass for unfinished business features. Commit pnpm-lock.yaml changes alongside dependency changes.

Migration changes must include the Prisma schema and new SQL migration. No editing applied migrations. Preserve provenance, missing values, conflicting streams and the spatial/time-series distinction. Never claim vendor production integration, real vaccine data, certification or automated disposition.
