# Data Integration Handoff Contracts v1

Data Integration Handoff Contracts v1 define the minimum stable evidence boundary between TV1 data processing, TV2 persistence and trip assignment, and the future TV3 QA web experience. They are contracts only: no database, endpoint, assignment algorithm, or frontend is implemented here.

```text
Logger
  |
  v
RawIngestRecord
  |
  v
TV1 Runtime Data Pipeline
  |-- CanonicalTimeSeriesMeasurement
  `-- Runtime Data Quality Result
          |
          v
TV2 Trip Association
          |
          v
QA Comparison Projection
          |
          v
TV3 QA Web
```

## Existing contract audit

| Concept | Existing implementation | Reused in D8 | D8 action |
| --- | --- | --- | --- |
| Preserved logger submission | `RawIngestRecordSchema` | Yes | Embed the existing raw contract in the read projection |
| Canonical measurement | `CanonicalTimeSeriesMeasurementSchema` | Yes | Embed the existing canonical contract without adding trip fields |
| Normalization provenance | `LoggerNormalizationResult`, timezone resolution | Yes | Project timezone resolution and normalization notes |
| Sequence data quality | `RuntimeDataQualityResult` and `runtime-dq-v1` | Yes | Define a lightweight per-record QA projection of the existing result |
| Trip association | No shared contract | No | Add reference-only `TripMeasurementAssociationSchema` |
| QA evidence comparison | No shared contract | No | Add strict `QAComparisonRecordSchema` with cross-link validation |
| Scenario/shipment contract | Scenario benchmark contracts are separate | No | Keep runtime trip handoff neutral and independent |

The integration contracts live in `@coldproof/shared-types`; no new workspace package is introduced.

## Trip measurement association

`TripMeasurementAssociationSchema` states whether one existing canonical measurement is associated with a trip. It does not determine whether an association is correct and does not repeat temperature or humidity.

Stable references are:

- `canonical_record_id`;
- `raw_ingest_id`;
- `source_sensor_id`;
- offset-bearing `observed_at`; and
- `trip_id` when assigned.

V1 uses two states:

- `UNASSIGNED`: no trip or method is present;
- `ASSIGNED`: both `trip_id` and `association_method` are required.

V1 methods are `DEVICE_TIME_WINDOW`, `MANUAL_QA`, and `IMPORT_CONTEXT`. They describe how a future integration produced a relation; the contract implements none of those algorithms. Association provenance records an explicit origin, resolver ID, and resolver version. `SYNTHETIC_DEMO_CONTEXT` labels contract fixtures or demo relations and must not be interpreted as a real shipment claim.

## QA comparison projection

`QAComparisonRecordSchema` is a read-oriented evidence projection containing:

- the existing `RawIngestRecord`, including exact `original_payload` and checksum;
- the existing canonical measurement, including parser and source provenance;
- timezone resolution and normalization notes;
- per-record DQ assessment state, policy ID, finding IDs, and findings; and
- a trip-association state and provenance.

The schema validates that:

- raw and canonical ingest IDs match;
- raw and canonical checksums and source formats match;
- association record, raw, sensor, and observed-time references match the canonical record; and
- every displayed DQ finding references the displayed canonical record.

This is schema-level consistency checking, not database referential integrity.

## Provenance chain

The target trace remains:

```text
original_payload
  -> raw.ingest_id
  -> canonical.raw_ingest_id
  -> canonical.record_id
  -> data_quality.findings[].record_ids
  -> trip_association.canonical_record_id
```

Raw payload text is not copied into or reparsed by the canonical or trip-association contracts. Canonical physical measurements are not duplicated in the trip relation.

## DQ and trip state are independent

Data quality describes evidence assessment. Trip state describes business integration. They are independent axes:

- `DQ = PASS`, `Trip = UNASSIGNED` is valid;
- `DQ = FLAGGED`, `Trip = ASSIGNED` is valid; and
- `DQ = NOT_ASSESSED` is not equivalent to `PASS`.

A trip state does not repair or invalidate a physical measurement, and a DQ finding does not decide trip membership.

## TV2 handoff

The intended backend flow is:

```text
HTTP logger request
  -> TV2 creates and persists RawIngestRecord
  -> TV2 calls TV1 processLoggerIngest()
  -> TV2 persists a successful canonical measurement or structured failure
  -> TV2 invokes and persists sequence DQ as appropriate
  -> TV2 applies its own trip-assignment logic
  -> TV2 creates TripMeasurementAssociation
  -> TV2 exposes comparison data to TV3
```

TV1 provides contracts and deterministic processing. TV2 owns persistence layout, transaction design, device lookup, association rules, and API behavior. D8 does not prescribe Prisma tables.

## TV3 handoff

TV3 may consume `QAComparisonRecord` without implementing raw parsing, canonical normalization, or DQ algorithms. The projection provides the raw submission, canonical physical view, technical provenance, DQ state/findings, and trip relation needed for comparison. It does not specify UI layout or grant QA business authority.

## Limitations and non-goals

D8 does not implement trip matching, shipment rules, QA decisions, batch release, GSP/GDP certification, compliance conclusions, excursion policy, persistence, authentication, or frontend behavior. Runtime associations are neutral; public benchmark observations are not asserted to be real pharmaceutical shipments.
