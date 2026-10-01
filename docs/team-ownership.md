# Team ownership — APEX

| Member | Owns | Deliverables / next work |
| --- | --- | --- |
| TV1 — Data & Parser Engineer | sources, imports, adapters, parsers, normalization, data-quality; canonical-schema, parser-contracts; data/observed, fixtures, manifests | verified source registry, Zenodo adapter, Mendeley spatial adapter, A/B/C fixture grammar, canonical provenance, missing/conflict quality checks |
| TV2 — Backend & Business Core Engineer | auth, users, scenarios, batches, exceptions; scenario-schema, shared-types; Prisma schema and business migrations; data/scenarios | DB core, scenario builder, batch/segment mapping, product profile, exception candidates, REST contracts, RBAC |
| TV3 — Frontend Engineer | apps/web | Source Registry, Import Console, Batch List/Detail, chart/timeline, provenance, exceptions, QA screen, report preview, API client |
| TV4 — Evidence / QA / Platform Engineer | qa-reviews, reports, audit; tests, infra, .github; common platform | QA backend, JSON/PDF evidence, hash/version, audit, regression/integration/E2E, Docker, CI/release |

Shared packages are cross-team contracts: changes need review from consumers. TV2 owns executable business DB migrations; TV4 reviews deployment. TV1 reviews provenance columns. TV2/TV4 review API composition and common code. Root tooling is TV4 with affected teammates reviewing.

Use module-local tests for local behavior and tests/ for cross-module contracts. CODEOWNERS uses placeholder handles; replace before publishing. Ownership assigns review responsibility, not permission to change shared contracts without coordination.
