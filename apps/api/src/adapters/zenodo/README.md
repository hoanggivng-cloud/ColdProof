# Zenodo cold-storage adapter

`ZenodoAdapter` parses the raw CSV files from *Temperature and Humidity Time Series of Cold Storage Room Monitoring* ([DOI 10.5281/zenodo.15130001](https://doi.org/10.5281/zenodo.15130001)). Its adapter id is `zenodo-cold-storage` and its version is `1.0.0`.

Expected source structure:

```text
Date;Time;Temperature (C);Humidity (%)
DD.MM.YYYY;HH:mm:ss;numeric Celsius;numeric percent
```

The delimiter is `;`. Both CRLF and LF line endings are supported, as is an optional UTF-8 BOM. Each emitted `ParsedTimeSeriesRecord.rawRef` uses the physical source line (`row:N`), so blank or repeated-header lines never renumber later measurements. A `sourceSensorId` already present in `FileMetadata` is preserved; when absent it is derived only from the deterministic `SENSORNN.CSV` filename pattern. Checksums and all other source metadata come from `FileMetadata`, never from hard-coded adapter values.

Repeated copies of the exact structural header and blank lines are skipped. Other malformed rows are still emitted when a header has been recognized. They retain physical-row provenance and raw values, with deterministic warnings such as `WRONG_COLUMN_COUNT`, `INVALID_DATE`, `INVALID_TIME`, `INVALID_TEMPERATURE`, and `INVALID_HUMIDITY`. Invalid numeric values are not converted to zero.

The source publishes date and wall-clock time without a timezone. Valid values are normalized to timezone-naive `YYYY-MM-DDTHH:mm:ss`; `timestampRaw` preserves the two original source columns separated by `;`. The adapter never appends `Z` or invents an offset. Downstream normalization must apply an evidence-backed timezone policy before producing an offset-bearing canonical measurement.

The adapter parses source structure only. Canonical normalization and Data Quality happen downstream. It does not interpolate measurements, generate missing intervals, resolve duplicates or sensor conflicts, detect excursions, or attach batch/business context.
