# Runtime Logger Normalization v1

## Scope

Runtime Logger Normalization v1 is a pure data-layer operation:

```text
RawIngestRecord
  -> raw checksum verification
  -> JSON parsing
  -> declared-format contract validation
  -> canonical normalization
  -> LoggerNormalizationResult
```

The public API is `normalizeLoggerIngest(rawIngestRecord, context?)` from `@coldproof/logger-normalizer`. It performs no database, filesystem, or network operations.

## Raw and canonical separation

`original_payload` remains the exact UTF-8 request body text submitted by the synthetic logger. Normalization does not rewrite or replace it. The parsed event and canonical measurement are derived views linked through `ingest_id` and `raw_ingest_id`.

Before JSON parsing, the normalizer hashes the exact `original_payload` UTF-8 bytes and compares that digest with `content_checksum_sha256`. A mismatch is a blocking `RAW_PAYLOAD_CHECKSUM_MISMATCH`; the stored checksum is never replaced.

## Mapping

### LOGGER_A

| LOGGER_A input | Canonical output |
| --- | --- |
| `device_id` | `source_sensor_id` |
| `recorded_at` | `timestamp` |
| `temperature` | `temperature_c` |
| `humidity` | `humidity_pct` |
| `RawIngestRecord.ingest_id` | `raw_ingest_id` |
| `RawIngestRecord.content_checksum_sha256` | `source_checksum_sha256` |

The payload's offset-bearing timestamp is preserved. Timezone resolution is recorded as `PAYLOAD_DECLARED`. `battery` has no canonical temperature-measurement field and remains available in the preserved raw payload rather than being given a fabricated mapping.

### LOGGER_B

| LOGGER_B input | Canonical output |
| --- | --- |
| `serial` | `source_sensor_id` |
| `timestamp` plus explicit offset context | `timestamp` |
| parsed `temp_c` | `temperature_c` |
| parsed `rh_percent` | `humidity_pct` |
| `RawIngestRecord.ingest_id` | `raw_ingest_id` |
| `RawIngestRecord.content_checksum_sha256` | `source_checksum_sha256` |

LOGGER_B numeric strings are deliberately parsed only after the strict LOGGER_B contract succeeds. Missing and invalid temperature values are blocking failures and are never replaced with zero.

## Timezone policy

LOGGER_A carries its own offset. The canonical timestamp preserves that representation and records `timezone_resolution.origin = PAYLOAD_DECLARED`.

LOGGER_B carries no timezone evidence. Without context, normalization fails with `TIMEZONE_CONTEXT_REQUIRED`. The caller may provide an explicit numeric offset whose origin is one of:

- `DEVICE_CONTEXT`
- `NORMALIZATION_CONFIGURATION`

For example, `10/10/2026 14:30:00` plus explicit `+07:00` becomes `2026-10-10T14:30:00+07:00`. This is recorded as caller-supplied context, never as payload-declared evidence. No UTC, Vietnam, or local-machine timezone is assumed.

## Device identity

LOGGER_A uses `device_id`; LOGGER_B uses `serial`. That value becomes `source_sensor_id`. When `RawIngestRecord.external_device_id` is present, it must match the validated payload identity. A disagreement returns `DEVICE_IDENTITY_MISMATCH`; the normalizer does not silently prefer either value.

## Determinism and provenance

The canonical `record_id` is a SHA-256 identifier derived from the ingest ID, raw content checksum, parser ID, and parser version. Identical input and context produce identical output.

Successful provenance is:

```text
original_payload
  -> ingest_id
  -> canonical raw_ingest_id
  -> canonical record_id
```

The compatibility locator `raw-ingest:<ingest_id>` populates `source_file` because the current canonical schema remains file-oriented. It is a logical raw-asset locator, not a filesystem filename. `source_row_or_ref = payload` identifies the submitted JSON payload, and the raw content checksum is preserved as `source_checksum_sha256`.

Parser identities are stable:

- LOGGER_A: `runtime-logger-a` version `1.0.0`
- LOGGER_B: `runtime-logger-b` version `1.0.0`

## Failure handling

Expected bad input returns a structured unsuccessful `LoggerNormalizationResult`; it does not produce a partial canonical measurement. Runtime v1 represents checksum mismatch, malformed JSON, declared-format mismatch, device mismatch, invalid timezone context, invalid timestamp, missing/invalid temperature, unknown format, and canonical validation failures.

## Non-goals and team boundaries

D5 processes one `RawIngestRecord` at a time. It does not detect cross-record duplicates, out-of-order sequences, gaps, excursions, or compliance. It does not persist records, expose an HTTP endpoint, assign trips, or implement QA UI behavior.

- TV1 owns these format, integrity, normalization, data-quality representation, and provenance semantics.
- TV2 may call the pure package from an ingestion service and owns persistence and trip association.
- TV3 may follow `ingest_id`, canonical `record_id`, and a later trip-association identifier to compare raw, normalized, and associated views.

LOGGER_A and LOGGER_B remain synthetic test formats. LOGGER_B is vendor-inspired only and is not an official commercial vendor integration.
