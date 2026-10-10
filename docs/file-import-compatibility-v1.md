# File Import Compatibility & Test Pack v1

## Purpose

D10 defines the data-side compatibility boundary for deterministic logger-file
imports. It does not implement HTTP uploads, multipart parsing, object storage,
database persistence, transactions, trip assignment, or frontend behavior.

```text
Uploaded CSV/XLSX
       ↓
RawFileImport
       ↓
File Adapter
       ↓
Parsed Rows
       ↓
CanonicalTimeSeriesMeasurement
       ↓
Runtime DQ (D6)
       ↓
TV2 persistence / Trip
       ↓
QA
```

The exact uploaded bytes are immutable evidence. `content_sha256` is calculated
over those bytes and is checked before parsing. A checksum proves byte-level
integrity of the referenced file; it does not prove sensor accuracy or chain of
custody.

## Existing components reused

| Concept | Existing implementation | D10 use |
|---|---|---|
| Raw file bytes and metadata | `RawAsset`, `FileMetadata` | Extended with `RawFileImport` |
| Parsed rows | `ParsedTimeSeriesRecord`, `ParsedSpatialRecord` | Reused without a competing row model |
| Canonical measurement | `CanonicalTimeSeriesMeasurementSchema` | Authoritative output schema |
| CSV public-source parser | `ZenodoAdapter` | Used directly for `ZENODO_CSV` |
| XLSX reader | Mendeley OOXML reader | Shared by Mendeley and `VENDOR_C_XLSX` |
| Spatial workbook parser | Pure `MendeleyParser`, wrapped by `MendeleyAdapter` for NestJS | Used only through the context API; D10 does not load the provider |
| Time-series normalization | Pure `normalizeTimeSeriesRecord()` core shared with `NormalizationService` | Preserves deterministic IDs and provenance without requiring NestJS |
| Sequence data quality | `assessLoggerSequence()` | Sole duplicate/conflict/order/gap engine |

No new CSV or XLSX dependency was added. The CSV parser uses a declared,
format-specific delimiter and conservative quoted-field handling. It never
autodetects an ambiguous delimiter.

The supported local D10 import boundary is
`apps/api/src/adapters/file-import/index.ts`. Consumers must use that barrel
rather than importing the implementation file directly. Its module graph is
pure and does not evaluate NestJS providers.

## Supported formats and adapter identities

| Source format | Adapter | Role |
|---|---|---|
| `VENDOR_A_CSV` | `vendor-a-csv@1.0.0` | Comma CSV, ISO offset timestamp |
| `VENDOR_B_CSV` | `vendor-b-csv@1.0.0` | Semicolon CSV, split date/time, external timezone |
| `VENDOR_C_XLSX` | `vendor-c-xlsx@1.0.0` | Measurement worksheet with explicit-offset timestamp |
| `ZENODO_CSV` | `zenodo-cold-storage@1.0.0` | Real frozen public CSV regression source |
| `MENDELEY_XLSX` | `mendeley-insulated-box@1.0.0` | Spatial/experimental context only |

The three vendor formats are `SYNTHETIC` and `VENDOR_INSPIRED`. They are not
official integrations with any commercial vendor.

## File contracts

`RawFileImport` preserves:

- `import_id`
- original UTF-8 filename
- exact file bytes, byte length, media type, and SHA-256
- declared source format and origin
- optional adapter hint
- optional explicit timezone configuration
- upload-transport metadata supplied by TV2

`FileImportResult` contains the adapter identity, reconciled row counts,
canonical measurements, explicit row rejections, warnings, and fatal issues.
The summary does not create a second copy of physical measurement values.

Canonical provenance follows:

```text
record_id
  → raw_ingest_id (= import_id compatibility reference)
  → source_row_or_ref
  → source_file
  → source_checksum_sha256
  → parser_id / parser_version
```

For CSV, `source_row_or_ref` is `row:<physical-row>`. For XLSX it is
`sheet:<sheet-name>:row:<physical-row>`.

## Failure policy

File-level failures return `FILE_REJECTED` and no canonical measurements.
Examples include invalid contracts, checksum/size mismatch, empty or malformed
files, missing required columns, unsupported content, corrupted workbooks, and
ambiguous compatible worksheets.

Structurally valid files use `ACCEPT_VALID_ROWS_WITH_REJECTIONS`. Invalid data
rows remain visible as structured `row_rejections`; valid rows become canonical
measurements. Repeated headers and blank separators are structural rows, not
missing physical observations.

The required reconciliation is machine-validated:

```text
physical_rows = structural_rows + candidate_data_rows
candidate_data_rows = canonical_rows + rejected_data_rows
```

Example `GOLDEN_PARTIAL_REJECTION`:

```text
physical rows:       5
structural rows:     1
candidate rows:      4
canonical rows:      2
rejected data rows:  2
```

## CSV policy

- `VENDOR_A_CSV`: comma delimiter; required `device_id`, `recorded_at`, and
  `temperature_c` columns.
- `VENDOR_B_CSV`: semicolon delimiter; required `Device ID`, `Date`, `Time`,
  and `Temperature (C)` columns.
- `ZENODO_CSV`: existing semicolon layout with split `Date` and `Time` fields.
- UTF-8 BOM, LF, CRLF, quoted values, extra columns, blank rows, and repeated
  headers are tested.
- Unclosed quotes and quoted multiline fields are rejected conservatively.

## XLSX policy

XLSX files are decoded by the existing bounded OOXML ZIP reader. Macros and
formulas are never executed. Formula-based measurement cells are rejected even
when a workbook carries a cached value.

For `VENDOR_C_XLSX`:

- exactly one compatible sheet is selected automatically;
- multiple compatible sheets require explicit `sheet_name`;
- zero compatible sheets return `UNSUPPORTED_SHEET_STRUCTURE`;
- numeric or finite numeric-string measurement cells are accepted;
- blank/invalid measurement cells become explicit row rejections.

## Timezone policy

Offset-bearing timestamps use their payload-declared offset. Source-local
timestamps never inherit UTC, `Z`, `+07:00`, Vietnam time, or the host timezone.
`VENDOR_B_CSV` and Zenodo timestamps require explicit import/device context or
produce `TIMEZONE_CONTEXT_REQUIRED`.

Tests may supply an explicit offset to exercise canonical compatibility. That
test configuration is not represented as a source fact.

## Runtime DQ compatibility

D10 does not implement sequence DQ. Accepted canonical measurements can be
passed to `assessImportedMeasurements()`, which delegates to D6
`assessLoggerSequence()`. Duplicate, conflict, out-of-order, gap, cadence, and
multi-device behavior therefore retain the existing policy and finding model.
No missing measurement is generated or interpolated.

## Public regression sources

Zenodo, DOI `10.5281/zenodo.15130001`, remains `REAL_PUBLIC_DATA` and a real CSV
parser regression source. Its measurements are not claimed to be a
pharmaceutical shipment, a Vietnamese route, or a commercial-vendor export.

Mendeley Data, DOI `10.17632/sz5dgkz7k8.1`, remains `REAL_PUBLIC_DATA`
experimental/spatial context. `parseMendeleySpreadsheetContext()` returns
spatial records with `timeline_semantics = NONE` and DQ `NOT_ASSESSED`.
Conditions C01–C13 are conditions, not devices. D10 never invents timestamps or
concatenates Mendeley rows onto a Zenodo timeline.

## Deterministic test pack

`tests/fixtures/file-import/manifest.json` describes 25 compact cases. Text
fixtures are checked in; XLSX fixtures are generated deterministically in
memory. Six cases are golden:

- `GOLDEN_CSV_NORMAL`
- `GOLDEN_CSV_REPEATED_HEADER`
- `GOLDEN_XLSX_NORMAL`
- `GOLDEN_PARTIAL_REJECTION`
- `GOLDEN_DQ_GAP`
- `GOLDEN_TIMEZONE_REQUIRED`

Selected cases reference the existing Vietnam healthcare demo catalog for
display context. Product identity remains `PUBLIC_PRODUCT_REFERENCE`; routes,
batches, shipments, and associations remain `SYNTHETIC_DEMO_CONTEXT`. File
measurements remain synthetic unless the input is an actual frozen public file.

Vietnamese filenames and human metadata are UTF-8, for example
`dữ liệu vaccine Cần Thơ.csv`. Technical identifiers and enums remain English
ASCII.

## TV1 / TV2 / TV3 boundary

TV1 owns these contracts, adapters, normalization semantics, provenance,
fixtures, and expected outcomes. TV2 must construct/persist `RawFileImport`,
choose transaction behavior, enforce operational upload/row limits, persist
results, and associate measurements with trips. Limits are optional explicit
parser inputs; D10 does not invent production limits.

TV3 may display filename, checksum, adapter, row counts, rejections, canonical
references, and DQ status. D10 adds no UI styling model and does not duplicate
the D8 comparison contract.

## Limitations

- No upload endpoint, object storage, database write, or transaction policy.
- No delimiter guessing.
- No formula evaluation.
- No macro execution.
- No XLSX date-serial inference in v1; timestamps must be explicit strings.
- No trip assignment or excursion/compliance interpretation.
