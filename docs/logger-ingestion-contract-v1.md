# Logger Ingestion Contract v1

## Scope

Logger Ingestion Contract v1 defines the data boundary for simulated logger submissions. It does not implement an HTTP endpoint, persistence, trip assignment, a simulator, or a QA interface.

The runtime data flow is:

```text
Logger payload
  -> RawIngestRecord
  -> parser and normalizer
  -> CanonicalTimeSeriesMeasurement
  -> trip assignment (TV2)
  -> QA comparison (TV3)
```

Raw and canonical records are distinct evidence objects. Parsing and normalization never rewrite a historical raw payload.

## Existing contract compatibility

| Concept | Existing implementation | Reusable? | Gap | Action in v1 |
| --- | --- | --- | --- | --- |
| LoggerEvent | No logger-specific event contract | No | Formats and origin semantics were undefined | Add strict `LoggerAEventSchema`, `LoggerBEventSchema`, and `LoggerEventSchema` |
| RawIngestRecord | `RawAsset` preserves file bytes, but is file-oriented | Partly | No HTTP payload identity, receipt time, or raw-ingest provenance | Add `RawIngestRecordSchema` without persistence fields |
| CanonicalMeasurement | Strict `CanonicalTimeSeriesMeasurementSchema` | Yes | No raw-ingest reference | Add optional `raw_ingest_id`; retain all existing canonical provenance |
| ParserResult / NormalizationResult | `ParsedRecord`, `ParserAdapter`, and result-based normalization exist | Yes | Logger boundary outcomes were not shared schemas | Add logger parser and normalization result schemas that reuse the canonical measurement schema |
| DataQualityFlag | Time-series DQ issues and baseline canonical flags exist | Partly | Ingestion and normalization failures were not representable | Add `LoggerDataQualityCode` for contract-level outcomes |
| Provenance reference | Dataset, file, raw ref, checksum, parser ID/version already exist | Yes | Raw HTTP submission was not linkable | Link canonical output to `RawIngestRecord.ingest_id` with `raw_ingest_id` |
| Device/source identity | `sourceSensorId` and `source_sensor_id` exist | Yes | Raw external identifier was absent | Add `external_device_id`; canonical logger records use `source_sensor_id` |

## Simulated logger formats

### LOGGER_A

`LOGGER_A` is a ColdProof simulated JSON contract:

```json
{
  "device_id": "LOGGER-A-001",
  "recorded_at": "2026-10-10T14:30:00+07:00",
  "temperature": 5.4,
  "humidity": 72.1,
  "battery": 91
}
```

Its contract metadata is:

```text
source_type = SIMULATED_LOGGER
source_format = LOGGER_A
origin = SYNTHETIC
timestamp_semantics = OFFSET_DECLARED_IN_PAYLOAD
```

### LOGGER_B

`LOGGER_B` deliberately models a heterogeneous, vendor-inspired shape:

```json
{
  "serial": "B-0001",
  "timestamp": "10/10/2026 14:30:00",
  "temp_c": "5.4",
  "rh_percent": "72.1"
}
```

Its contract metadata is:

```text
source_type = SIMULATED_LOGGER
source_format = LOGGER_B
origin = SYNTHETIC
format_origin = VENDOR_INSPIRED
timestamp_semantics = SOURCE_LOCAL_TIMEZONE_UNSPECIFIED
```

`VENDOR_INSPIRED` does not claim compatibility with, certification by, or reverse engineering of a commercial vendor.

## Raw preservation

`RawIngestRecord` stores:

- a stable `ingest_id`;
- an offset-bearing system receipt time in `received_at`;
- source type, detected source format, and synthetic origin;
- the external device identifier when it can be extracted;
- `original_payload`, containing the exact UTF-8 request body text;
- a lowercase SHA-256 content checksum;
- transport metadata.

The parsed logger event is a derived view. It does not replace `original_payload`. Invalid, incomplete, and unknown-format submissions can therefore remain inspectable.

## Canonical mapping and provenance

The existing canonical time-series contract remains authoritative. A successful logger normalization maps:

| Logger/raw field | Canonical field |
| --- | --- |
| `RawIngestRecord.ingest_id` | `raw_ingest_id` |
| `device_id` or `serial` | `source_sensor_id` |
| resolved observed time | `timestamp` |
| temperature value | `temperature_c` |
| humidity value | `humidity_pct` |
| logger format | `source_format` |
| parser identity | `parser_id`, `parser_version` |
| exact raw checksum | `source_checksum_sha256` |
| simulated origin | `measurement_origin = SYNTHETIC` |

The existing canonical `source_file` field is file-oriented. Until a coordinated canonical provenance revision exists, ingestion must populate it with an explicit logical raw-asset locator such as `raw-ingest:<ingest_id>`, not a fabricated filename. `raw_ingest_id` remains the authoritative raw-record link.

The normalization result requires its top-level `raw_ingest_id` to match the canonical measurement reference. This supports the QA trace:

```text
raw ingest ID -> canonical record ID -> later trip association ID
```

No temperature is defaulted, interpolated, or changed to zero when missing or invalid.

## Timezone policy

`LOGGER_A.recorded_at` includes an explicit numeric offset and can be normalized without inventing timezone evidence. A successful normalization records that offset with `timezone_resolution.origin = PAYLOAD_DECLARED`.

`LOGGER_B.timestamp` is source-local and has no offset. Contract validation preserves that ambiguity. Canonical normalization must fail with `TIMEZONE_CONTEXT_REQUIRED` until a caller supplies explicit device/source context or explicit normalization configuration. A later successful result must record whether resolution came from `DEVICE_CONTEXT` or `NORMALIZATION_CONFIGURATION`. The contract does not append `Z`, assume UTC, or assume `+07:00`.

## Data-quality outcomes

Contract v1 can represent:

- `RAW_PAYLOAD_CHECKSUM_MISMATCH`
- `MALFORMED_JSON_PAYLOAD`
- `PAYLOAD_FORMAT_MISMATCH`
- `DEVICE_IDENTITY_MISMATCH`
- `INVALID_TIMEZONE_CONTEXT`
- `CANONICAL_VALIDATION_FAILED`
- `INVALID_TIMESTAMP`
- `TIMEZONE_CONTEXT_REQUIRED`
- `MISSING_TEMPERATURE`
- `INVALID_TEMPERATURE`
- `DUPLICATE_RECORD`
- `OUT_OF_ORDER_RECORD`
- `UNKNOWN_DEVICE_FORMAT`

These codes make outcomes representable; this milestone does not implement complete runtime detection. Existing time-series DQ evaluation remains responsible for sequence-level duplicate and out-of-order analysis after canonicalization.

## Team boundaries

### TV1 — data contracts

TV1 owns logger formats, raw preservation semantics, parsing and normalization contracts, data-quality representation, and raw-to-canonical provenance.

### TV2 — ingestion and trip orchestration

TV2 owns the NestJS endpoint, persistence, device lookup, and trip assignment. TV1 exposes stable assignment inputs: canonical record ID, external device identity through `source_sensor_id`, observed time, raw-ingest reference, and source/parser provenance. This contract does not define Prisma models or automatic trip rules.

### TV3 — QA comparison

TV3 may use `ingest_id`, `record_id`, and the future trip-association identifier to compare the preserved raw payload, canonical measurement, and trip association. This contract does not implement frontend or QA workflow behavior.
