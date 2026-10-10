# Runtime Data Quality v1

## Scope and boundary

Runtime Data Quality v1 evaluates sequences of successful D5 canonical measurements:

```text
RawIngestRecord
  -> D5 normalization
  -> CanonicalTimeSeriesMeasurement[]
  -> D6 runtime data quality
  -> findings, assessments and summary
```

D5 owns raw integrity, JSON parsing, format validation, timezone resolution and single-record canonicalization. D6 does not reparse raw payloads or recover D5 failures. It evaluates relationships between already-valid canonical records.

The public pure API is `assessLoggerSequence(measurements, context?)` from `@coldproof/runtime-data-quality`. It performs no database, filesystem or network operations.

The implementation follows the existing ColdProof time-series DQ principles: explicit cadence, deterministic findings, original-order anomaly detection, sorted-copy gap analysis and non-destructive evidence handling. Runtime logger stream identity and duplicate/conflict classification are specialized because each D5 raw ingest has its own logical `source_file` locator.

## Assessment semantics

Canonical `missing_flag`, `duplicate_flag` and `conflict_flag` remain compatibility baseline fields. D6 does not mutate them and does not interpret their D5 value of `false` as an authoritative sequence assessment.

Assessment state is explicit in the D6 result:

- `NOT_ASSESSED`: no successful D6 result exists, including invalid DQ configuration.
- `PASS`: D6 evaluated the record or sequence and produced no related finding.
- `FLAGGED`: D6 produced one or more related findings.

Downstream code should use the D6 assessment and findings as the runtime sequence-quality result rather than treating baseline canonical booleans as proof of assessment.

## Device partitioning

Runtime streams use `(source_dataset, source_format, source_sensor_id)`. `source_file` is deliberately excluded because D5 uses a distinct `raw-ingest:<ingest_id>` locator for each submission. Records from different devices or formats do not contaminate each other's sequence state.

## Duplicate and conflict semantics

`DUPLICATE_RECORD` means that distinct canonical record IDs in the same device stream have the same observed timestamp and equivalent temperature/humidity values. D6 does not delete either record.

`CONFLICTING_RECORD` means that distinct records in the same device stream have the same observed timestamp but different temperature or humidity values. A conflict is not downgraded to a simple duplicate. All record IDs and physical values remain available in the finding for QA inspection.

Record ID equality alone is not used for duplicate detection. D5 record IDs distinguish independent ingests because their deterministic hash includes `ingest_id`, raw checksum, parser ID and parser version.

## Arrival order

`OUT_OF_ORDER_RECORD` is emitted when a timestamp decreases relative to the preceding input record for the same device stream. Original input order is used before any chronological view is created, so sorting cannot hide arrival-order regression.

## Cadence and missing intervals

Cadence is explicit and optional:

```json
{
  "expected_interval_ms": 5000,
  "tolerance_ms": 0
}
```

Without `expected_interval_ms`, D6 makes no missing-interval inference. With cadence configured, a gap is emitted only when the observed delta is greater than `expected_interval_ms + tolerance_ms`.

A missing-interval finding records its two observed boundary records, observed delta, applied cadence/tolerance and interval semantics `[start,end)`. An estimated missing count is included only when the observed delta is an exact multiple of the expected cadence.

A missing interval is a derived data-quality finding. It is not an observed measurement. D6 never interpolates temperature, creates a canonical row, or fabricates a missing physical observation.

## Provenance and determinism

Findings reference canonical `record_id` values, preserving the chain:

```text
DQ finding -> canonical record_id -> raw_ingest_id -> original payload
```

D6 does not replace record IDs, raw-ingest IDs, source checksums, timestamps or physical values. Finding IDs are deterministic SHA-256 identifiers derived from policy, device, related record IDs and evidence.

The stable policy identity is `runtime-dq-v1`. Identical ordered canonical input and identical configuration produce identical output without wall-clock state or randomness.

## Limitations and non-goals

Runtime Data Quality v1 does not implement raw parsing, timezone inference, trip assignment, persistence, QA decisions, excursion/compliance policy, interpolation, cross-device physical conflict analysis or expected prefix/tail coverage. It detects gaps only between observed records within a device stream.
