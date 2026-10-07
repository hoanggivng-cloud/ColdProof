# Time-series data quality

`CanonicalTimeSeriesMeasurement[]` → `DataQualityService` → `QualityIssue[]` + summary

`DataQualityService.evaluateTimeSeries()` evaluates canonical time-series evidence records and returns deterministic quality issues plus global/per-stream summaries.

The sampling cadence is always supplied through `DataQualityPolicy`; the generic engine does not hard-code Zenodo's nominal five-second interval. Stream identity is the stable provenance tuple `(source_dataset, source_file, source_sensor_id)`, so equal timestamps in different sensor streams are independent.

V1 emits:

- `MISSING_INTERVAL` for gaps between observed records that exceed the expected interval plus tolerance. It reports boundaries, gap, policy and missing count but never creates missing measurements.
- `DUPLICATE_TIMESTAMP` once per timestamp and stream, referencing all distinct record IDs at that instant.
- `OUT_OF_ORDER_TIMESTAMP` when a record timestamp decreases relative to the preceding record in original input order.

Original order is used for out-of-order detection. Missing-gap analysis uses a sorted copy after duplicate instants are collapsed; the input array and canonical measurements are never mutated. Evaluation does not set canonical quality flags, interpolate, fill, delete, average or overwrite evidence.

Only gaps between the first and last observed record in each stream are evaluated. V1 does not infer a missing prefix/tail, compare sensors against a global master timeline, detect sensor conflict or make excursion/compliance judgments. Those concerns require later orchestration, business context or Data Quality stages.
