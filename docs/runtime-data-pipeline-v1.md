# Runtime Data Pipeline v1

Runtime Data Pipeline v1 is the persistence-independent TV1 orchestration layer for simulated logger ingestion. It composes the existing D5 normalizer and D6 sequence data-quality evaluator; it does not replace either contract or algorithm.

```text
External Logger Payload
        |
        v
TV2 receives HTTP (future consumer)
        |
        v
RawIngestRecord (persisted by TV2)
        |
        v
TV1 Runtime Data Pipeline
        |-- D5 Normalize
        |       |
        |       v
        |  CanonicalTimeSeriesMeasurement
        |
        `-- D6 Sequence DQ (separate explicit call)
                |
                v
           DQ Findings
        |
        v
TV2 Persistence / Trip Association (future consumer)
        |
        v
TV3 QA Comparison (future consumer)
```

## Package responsibilities

`@coldproof/runtime-data-pipeline` exports:

- `processLoggerIngest(rawIngestRecord, options?)`, which delegates one raw envelope to D5 `normalizeLoggerIngest`;
- `assessProcessedSequence(canonicalMeasurements, dqContext?)`, which delegates a sequence to D6 `assessLoggerSequence`; and
- `RUNTIME_DATA_PIPELINE_VERSION`, fixed to `runtime-data-pipeline-v1`.

The package performs no network calls, database access, or filesystem writes. It does not own HTTP transport or raw storage. Identical inputs and contexts produce identical results; no wall-clock value or random identifier is introduced.

## Raw and canonical separation

TV2 first preserves the exact logger submission in a `RawIngestRecord`. D5 verifies its checksum and validates the declared logger format before producing a canonical measurement. The pipeline neither rewrites `original_payload` nor replaces its checksum or identifiers.

Successful traceability is:

```text
original_payload
  -> ingest_id
  -> measurement.raw_ingest_id
  -> measurement.record_id
  -> DQ finding.record_ids
```

Parser identity/version, source format, source sensor identity, timestamp, checksum, and physical values remain in the existing D5 canonical result. D7 deliberately does not create duplicate copies of these contracts.

## Normalization boundary

TV2 supplies:

- a contract-valid `RawIngestRecord`; and
- for timezone-naive `LOGGER_B`, an explicit D5 normalization context such as a device or normalization-configuration offset.

The result is a thin pipeline envelope containing the ingest identity and the existing `LoggerNormalizationResult`. On success, the canonical measurement is `result.normalization.measurement`. On failure, all structured D5 issue codes remain available in `result.normalization.issues`, including checksum, JSON, timezone, identity, and temperature failures.

`NORMALIZATION_FAILED` means D5 could not produce a canonical measurement. No partial measurement is fabricated.

## Data-quality boundary

D6 is sequence-aware, so D7 never runs it implicitly for a single record. Every single-record processing result carries `dq_assessment_status: NOT_ASSESSED`. This is not equivalent to `PASS`.

Callers explicitly pass successful canonical measurements to `assessProcessedSequence`. Optional cadence and tolerance remain visible in the D6 context; no cadence is inferred. D7 preserves the D6 assessment states `NOT_ASSESSED`, `PASS`, and `FLAGGED`, its policy version, detailed findings, and provenance record IDs.

If normalization fails, there is no canonical measurement to assess. The caller must not translate the pipeline's `NOT_ASSESSED` state into a data-quality pass.

## TV1 to TV2 handoff

The expected future TV2 flow is:

1. receive the external payload;
2. build and persist the immutable `RawIngestRecord`;
3. call `processLoggerIngest` and persist a successful canonical result or its structured failure;
4. call or update sequence DQ with explicit configuration where appropriate; and
5. associate canonical measurements with trips using TV2 business rules.

D7 does not prescribe Prisma tables, transaction boundaries, device lookup, or persistence status fields.

## Trip and QA boundaries

TV1 does not assign trips. A successful canonical record exposes stable inputs for downstream association: `record_id`, `raw_ingest_id`, `source_sensor_id`, `timestamp`, `source_format`, and provenance. Trip identity is not added by normalization.

Future QA can correlate raw payloads, canonical measurements, DQ findings, and TV2 trip associations through those stable identifiers. D7 does not produce UI view models or QA decisions.

## Non-goals

This package does not implement NestJS endpoints, authentication, retries, queues, database writes, trip or shipment rules, excursion detection, compliance decisions, or frontend behavior.
