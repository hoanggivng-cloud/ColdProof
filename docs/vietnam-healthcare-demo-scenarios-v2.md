# Vietnam Healthcare Demo Scenarios v2

## Purpose

This catalog provides deterministic, non-database inputs for ColdProof backend integration, trip-association, data-quality, QA projection, frontend demonstration, and regression testing. It combines real public physical observations with controlled synthetic Vietnam healthcare/logistics context for software evidence testing.

Public physical data does not make synthetic shipment relationships real. The catalog is demo/test data, not pharmaceutical shipment evidence and not a compliance decision.

## Catalog and commands

The machine-readable catalog is under `data/demo/vietnam-healthcare/`:

- `catalog.json` indexes the scenarios and families.
- `products.json`, `locations.json`, and `routes.json` define synthetic demo references.
- `scenarios/VNHC-001.json` through `VNHC-028.json` are deterministic definitions.
- `expected-outcomes.json` is the machine-testable processing expectation manifest.
- `catalog-summary.md` is generated from the same definitions for human review.

Use:

```bash
pnpm demo:scenarios:list
pnpm demo:scenario --id VNHC-009
pnpm demo:scenario --id VNHC-009 --count 100000
node scripts/vietnam-demo-scenarios.mjs --check
```

`demo:scenario` generates a compact processing summary. The optional positive `--count` override supports deterministic load generation for a single-logger scenario without committing generated rows; the seed, format, device, cadence, and profile remain explicit. It does not write to a database or call an HTTP endpoint. Scenario definitions are regenerated only with the maintainer command `node scripts/vietnam-demo-scenarios.mjs --write`; `--check` proves tracked artifacts match the deterministic generator.

## Scenario taxonomy

| Family | Count | Primary role |
|---|---:|---|
| `ZENODO_OBSERVED_BACKED` | 8 | Continuous, half-open windows of real public time-series evidence |
| `SIMULATED_RUNTIME` | 14 | Deterministic LOGGER_A/LOGGER_B runtime and failure cases |
| `COMBINED_REFERENCE_CONTEXT` | 4 | Runtime primary evidence plus strictly supplemental Mendeley context |
| `MENDELEY_CONTEXT_ONLY` | 2 | Spatial/experimental QA reference without a runtime timeline |

All batch, shipment, route, lot, sender/receiver, handover, and trip-association context is labelled `SYNTHETIC_DEMO_CONTEXT`. Organization names are demo labels and are not claims about actual facilities or movements.

## Zenodo role

The Zenodo dataset *Temperature and Humidity Time Series of Cold Storage Room Monitoring* (DOI `10.5281/zenodo.15130001`, version v1) is a `REAL_OBSERVED_TIME_SERIES_SOURCE`. The eight catalog entries reference frozen source bytes, source checksum, sensor, physical row range, parser identity, and a three-hour `[start,end)` window containing 2,160 observations at five-second cadence.

The catalog never changes an observed temperature or humidity value and never inserts a synthetic measurement into a Zenodo sequence. Source-local timestamps remain `UNKNOWN_SOURCE_LOCAL`; no UTC or offset is invented. Synthetic Vietnam logistics context does not imply that the source experiment was pharmaceutical, a shipment, performed in Vietnam, or operated by a commercial logistics provider.

## Mendeley role and combination rules

The Mendeley dataset *Average temperature in an insulated box* (DOI `10.17632/sz5dgkz7k8.1`, version 1) is a `REAL_OBSERVED_EXPERIMENTAL_SPATIAL_CONTEXT_SOURCE`. C01–C13 are experimental conditions, not devices or vendors. Crosswalk semantics remain `PARTIALLY_VERIFIED` where the frozen source cannot establish more.

Every catalog relationship to Mendeley enforces:

- `relation_type = ILLUSTRATIVE_CONTEXT`
- `relation_origin = SYNTHETIC`
- `used_for_dq = false`
- `used_for_excursion_calculation = false`
- `causal_claim = NONE`
- `same_time_claim = NONE`
- `same_goods_claim = NONE`
- `same_environment_claim = NONE`
- `timestamp_status = NOT_APPLICABLE`
- `device_interpretation = NONE`

Mendeley and Zenodo are not treated as one physical timeline. No spatial value is assigned a fabricated timestamp, concatenated with a time series, or interpolated onto a logger timestamp.

## Simulated logger role

LOGGER_A and LOGGER_B are synthetic ColdProof test formats. LOGGER_B is vendor-inspired only and is not an official vendor integration. Definitions hold seed, device, count, start time, and cadence; rows are generated on demand through the existing D4 simulator and processed through D5–D7.

Invalid-input and sequence profiles are applied in the scenario layer around valid simulator output. This preserves the D4 contract: the simulator itself continues to generate contract-valid events. Profiles cover normal, duplicate, conflict, out-of-order, gap, multi-gap, high/low temperature patterns, normalization failures, multiple devices, handover boundaries, long routes, and mixed logger formats.

LOGGER_B definitions either provide explicit normalization context or intentionally omit it for `TIMEZONE_CONTEXT_REQUIRED`. A timezone is never inferred from Vietnam geography.

## Data-quality and temperature semantics

Expected states use `NOT_ASSESSED`, `PASS`, and `FLAGGED` without collapsing them. Normalization failures are `NOT_ASSESSED`, never DQ `PASS`. DQ findings come from the existing `runtime-dq-v1` implementation and remain device-partitioned. A missing interval is a derived finding and does not create a physical measurement.

`HIGH_TEMP_PATTERN` and `LOW_TEMP_PATTERN` describe synthetic measurements only. They are not excursion, regulatory, product-quality, or compliance conclusions. No excursion policy is applied by this catalog. Synthetic handover boundaries do not terminate or truncate physical thermal patterns.

## Golden scenarios

Five compact definitions are marked for CI regression:

- `VNHC-009` — `GOLDEN_NORMAL`
- `VNHC-010` — `GOLDEN_DUPLICATE`
- `VNHC-011` — `GOLDEN_CONFLICT`
- `VNHC-013` — `GOLDEN_GAP`
- `VNHC-020` — `GOLDEN_TIMEZONE`

The expected-outcome manifest records normalization state, DQ state, issue/finding codes, record counts, device counts, timezone requirements, and origin categories. It contains no compliance result.

## Product references

The product catalog uses generic, synthetic references only. Manufacturer and storage claims are intentionally null. A scenario's synthetic shipment relationship does not imply that any named or real manufacturer shipped a demo batch.

## QA and backend integration

The catalog includes cases for Raw ↔ Canonical ↔ DQ ↔ Trip comparison: assigned and unassigned trips, PASS and FLAGGED DQ, timezone-blocked normalization, checksum failure, and visible Mendeley supplemental context. Integration tests validate the D8 QA projection using actual D4–D7 outputs.

TV2 may consume definitions for persistence and trip-association tests, but this catalog implements neither. TV3 may display the evidence/provenance projections, but the catalog defines no UI or QA decision.

## Provenance model

Each scenario separates:

- real observed measurement origins (`REAL_PUBLIC_DATA`),
- generated logger origins (`SYNTHETIC`),
- synthetic business relationships (`SYNTHETIC_DEMO_CONTEXT`), and
- synthetic public-source illustrative relations (`SYNTHETIC`).

Zenodo and Mendeley references resolve through `data/manifests/source_manifest.csv`; Mendeley semantic status resolves through `data/scenarios/design/condition-crosswalk.csv`. Runtime definitions record simulator, normalizer, DQ policy, and catalog generator identity. Checksums establish frozen-file integrity only, not sensor accuracy, experimental validity, pharmaceutical suitability, or chain of custody.

## Limitations and non-goals

This milestone does not implement Prisma, migrations, NestJS endpoints, authentication, frontend components, operational trip matching, excursion policy, compliance approval, batch disposition, or changes to frozen public data. Optional load generation above the standard catalog volume can be produced from deterministic definitions without committing generated rows.
