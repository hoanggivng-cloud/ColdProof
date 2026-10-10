# Vietnam Healthcare Demo Scenarios v2.1

## Purpose

This catalog provides deterministic, non-database inputs for ColdProof backend integration, trip-association, data-quality, QA projection, frontend demonstration, and regression testing. It combines real public physical observations with controlled synthetic Vietnam healthcare/logistics context for software evidence testing.

Public physical data does not make synthetic shipment relationships real. The catalog is demo/test data, not pharmaceutical shipment evidence and not a compliance decision.

## Catalog and commands

The machine-readable catalog is under `data/demo/vietnam-healthcare/`:

- `catalog.json` indexes the scenarios and families.
- `products.json` records verified public product identity references.
- `locations.json` and `routes.json` define synthetic Vietnam demo facilities and routes.
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

Human-facing Vietnam content is stored as readable UTF-8 Vietnamese with diacritics. Technical IDs and enum values remain stable English/ASCII values.

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

Each expected outcome also records `expected_stage`: `NORMALIZATION`, `DATA_QUALITY`, or `NONE`. A blocking normalization error has one explicit `expected_failure_code`, produces no canonical measurement, and never proceeds to DQ.

`HIGH_TEMP_PATTERN` and `LOW_TEMP_PATTERN` describe synthetic measurements only. They are not excursion, regulatory, product-quality, or compliance conclusions. DQ `PASS` means only that no configured data-integrity anomaly was detected. No excursion policy is applied by this catalog. Synthetic handover boundaries do not terminate or truncate physical thermal patterns.

## Golden scenarios

Five compact definitions are marked for CI regression:

- `VNHC-009` — `GOLDEN_NORMAL`
- `VNHC-010` — `GOLDEN_DUPLICATE`
- `VNHC-011` — `GOLDEN_CONFLICT`
- `VNHC-013` — `GOLDEN_GAP`
- `VNHC-020` — `GOLDEN_TIMEZONE`

The expected-outcome manifest records normalization state, DQ state, issue/finding codes, record counts, device counts, timezone requirements, and origin categories. It contains no compliance result.

## Product references

The catalog contains five verified public identity references: Vaxigrip Tetra, Influvac Tetra, Gardasil 9, Prevenar 13, and Prevenar 20. Product identity comes from an explicit official manufacturer or regulator reference:

- Vaxigrip Tetra — Sanofi professional information. Manufacturer is deliberately not recorded because the selected page verifies identity but does not establish a legal manufacturing entity.
- Influvac Tetra — Singapore National Drug Formulary; manufacturer recorded as `Abbott Biologicals B.V.` from that regulator entry.
- Gardasil 9 — U.S. Food and Drug Administration product page.
- Prevenar 13 — Pfizer product information.
- Prevenar 20 — Pfizer product information.

`PUBLIC_PRODUCT_REFERENCE` describes identity only. The catalog does not add a product storage claim, regulatory claim, or operational shipment claim. Manufacturer is present only where supported by the stored source reference.

Existing `product_id` values remain stable for consumer compatibility. Each product adds a product-specific ASCII `public_reference_code` so verified identity is explicit without changing scenario foreign keys.

Product identity is separate from `batch_context`, `shipment_context`, `trip_context`, route, lot, sender, and receiver. Those scenario relationships always remain `SYNTHETIC_DEMO_CONTEXT`. A real product name does not imply that its manufacturer shipped, owned, approved, or participated in a demo scenario. Manufacturer remains null when the stored identity source does not support a precise manufacturer claim.

## Vietnam facilities and routes

The 13 facilities use synthetic names with real Vietnamese geography, for example:

- `Kho phân phối dược phẩm TP.HCM — DEMO`
- `Bệnh viện Demo Thủ Đức`
- `Trung tâm tiêm chủng Cần Thơ 01 — DEMO`
- `Kho lạnh miền Bắc tại Hà Nội — DEMO`

Facility types are limited to `DISTRIBUTION_HUB`, `COLD_STORAGE`, `HOSPITAL`, `VACCINATION_CENTER`, `CLINIC`, and `PROVINCIAL_HUB`. Routes expose origin, destination, optional waypoints, and Vietnamese display labels such as `TP.HCM → Long An → Cần Thơ`. These are display-ready synthetic routes, not records of real pharmaceutical movements.

## Scenario purpose and severity

`test_purposes` lets backend and frontend consumers filter scenarios by `PIPELINE`, `NORMALIZATION`, `DATA_QUALITY`, `TRIP_ASSOCIATION`, `QA_REVIEW`, `FRONTEND_DEMO`, or `REFERENCE_CONTEXT`.

`test_severity` (`INFO`, `LOW`, `MEDIUM`, or `HIGH`) is demo/test severity only. It is not regulatory severity, patient risk, GSP/GDP status, compliance, or batch disposition.

## Raw/canonical reconciliation

The standard runtime scope generates 25,704 raw records and 25,698 canonical records. The six rejected records are exactly:

- `VNHC-017` — `MISSING_TEMPERATURE`
- `VNHC-018` — `INVALID_TEMPERATURE`
- `VNHC-019` — `INVALID_TIMESTAMP`
- `VNHC-020` — `TIMEZONE_CONTEXT_REQUIRED`
- `VNHC-021` — `DEVICE_IDENTITY_MISMATCH`
- `VNHC-022` — `RAW_PAYLOAD_CHECKSUM_MISMATCH`

Each scenario rejects one raw record at normalization. The machine manifest enforces `25,704 = 25,698 + 6`. Sequence anomalies such as gaps, duplicates, and conflicts still normalize successfully and are assessed separately by DQ.

## QA and backend integration

The catalog includes cases for Raw ↔ Canonical ↔ DQ ↔ Trip comparison: assigned and unassigned trips, PASS and FLAGGED DQ, timezone-blocked normalization, checksum failure, and visible Mendeley supplemental context. Human-facing scenario, facility, route, and purpose labels are directly usable by TV3; technical IDs/enums remain unchanged. Integration tests validate the D8 QA projection using actual D4–D7 outputs.

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
