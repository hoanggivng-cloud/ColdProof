# Simulated Logger v1

## Purpose

The ColdProof simulated logger creates deterministic JSON payload streams for contract tests, future ingestion API tests, normalization tests, and reproducible demonstrations. It runs independently of the backend and does not require a database.

All generated values and device identities are synthetic. The generator is intentionally small and is not a scientifically validated physical model.

## Formats

### LOGGER_A

`LOGGER_A` emits numeric values and an offset-bearing timestamp:

```json
{"device_id":"LOGGER-A-001","recorded_at":"2026-10-10T14:30:00+07:00","temperature":5.5,"humidity":71.6,"battery":96}
```

Every internal event is validated with `LoggerAEventSchema` and carries `source_type = SIMULATED_LOGGER`, `source_format = LOGGER_A`, and `origin = SYNTHETIC`.

### LOGGER_B

`LOGGER_B` emits heterogeneous string values and a source-local timestamp:

```json
{"serial":"B-0001","timestamp":"10/10/2026 14:30:00","temp_c":"5.5","rh_percent":"71.6"}
```

Every internal event is validated with `LoggerBEventSchema`. Its `format_origin` is `VENDOR_INSPIRED`, and its timestamp remains `SOURCE_LOCAL_TIMEZONE_UNSPECIFIED`.

LOGGER_A and LOGGER_B are synthetic test formats. LOGGER_B is vendor-inspired only and is not an official vendor integration.

## CLI

Dry-run writes one payload JSON object per stdout line and never performs an HTTP request:

```sh
pnpm logger:simulate \
  --format LOGGER_A \
  --device LOGGER-A-001 \
  --count 10 \
  --seed 42 \
  --dry-run
```

For a pipe-ready stream without pnpm's lifecycle banner, use the silent pnpm form:

```sh
pnpm --silent logger:simulate \
  --format LOGGER_A \
  --device LOGGER-A-001 \
  --count 10 \
  --seed 42 \
  --dry-run
```

```sh
pnpm logger:simulate \
  --format LOGGER_B \
  --device B-0001 \
  --count 10 \
  --seed 42 \
  --dry-run
```

Optional HTTP mode posts each payload as `application/json` to the exact supplied URL:

```sh
pnpm logger:simulate \
  --format LOGGER_A \
  --device LOGGER-A-001 \
  --count 20 \
  --interval 1000 \
  --endpoint http://localhost:3000/api/ingest
```

The simulator does not assume that this endpoint exists. It does not retry failed requests. Connection errors, timeouts, and non-2xx responses fail the command explicitly.

## Determinism

The generator uses a local seeded `mulberry32` PRNG and never calls uncontrolled `Math.random()`. The same format, device, seed, start time, logical cadence, and count produce the same logical event sequence.

Defaults are deterministic:

- seed: `1`
- logical cadence: `5000` milliseconds
- LOGGER_A start: `2026-10-10T14:30:00+07:00`
- LOGGER_B start: `2026-10-10T14:30:00`

`--cadence` controls logical timestamp progression in whole seconds. `--interval` controls real waiting between HTTP requests. Dry-run never sleeps, even when `--interval` is supplied.

## Timezone semantics

LOGGER_A requires an ISO start time with `Z` or an explicit numeric offset and preserves that offset in every payload.

LOGGER_B requires a timezone-naive `YYYY-MM-DDTHH:mm:ss` start value and emits `DD/MM/YYYY HH:mm:ss`. Calendar arithmetic does not add a timezone claim. The downstream normalizer must still receive explicit timezone context before creating a canonical measurement.

## Contract and backend boundary

The simulator validates a complete internal logger event against the existing contract, then emits or posts only `event.payload`. This represents what an external simulated logger submits.

It does not create:

- raw ingest IDs;
- canonical measurement IDs;
- database records;
- trip or shipment assignments;
- QA decisions;
- excursion or compliance results.

Invalid and data-quality fault injection is intentionally deferred to a later milestone. Simulated Logger v1 prioritizes deterministic, contract-valid streams.
