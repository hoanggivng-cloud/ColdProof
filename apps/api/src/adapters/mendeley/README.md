# Mendeley spatial adapter

`MendeleyAdapter` parses version 1 of Mendeley Data dataset `sz5dgkz7k8`, *Average temperature in an insulated box*. It converts observed workbook matrix cells into `ParsedSpatialRecord`; it does not normalize them into canonical records.

## Verified workbook structure

The thirteen condition files (`C01`–`C13`) each contain one worksheet named `Feuil1` and no merged cells. Rows 1–2 contain condition metadata: condition number, PCM position, aspect ratio, ambient temperature, initial load temperature and spacing beneath the load. The adapter validates the condition number against the `C01`–`C13` filename but does not add those metadata fields to `ParsedSpatialRecord`, whose current contract has no experiment-metadata envelope.

The measured region is an explicitly labelled middle plane:

- `A4`: `Middle plane (X = 250 mm)` supplies `positionX`.
- `A6`: `Average temperature (°C)` identifies the measured quantity and Celsius unit.
- Row 7: `Z (mm)` followed by Z-coordinate columns.
- Rows labelled `Y = … mm`: Y coordinate followed by observed temperature cells.

Coordinates retain the source unit, millimetres. Every finite numeric temperature cell at a labelled `(X, Y, Z)` position emits one record. Blank cells and source `-` markers mean that no spatial observation exists at that matrix position and are skipped. Title/header rows and unlabeled cells outside the matrix are structural and are not emitted.

## Detection and provenance

Detection requires all three signals: Mendeley dataset metadata (`Mendeley` or `sz5dgkz7k8`), a `C01`–`C13` XLSX filename and the verified worksheet/header/matrix structure. Arbitrary XLSX files are not accepted.

Each record preserves the caller-supplied `sourceMetadata` unchanged. `rawRef` identifies the physical workbook cell, for example `sheet:Feuil1:cell:B8`; `conditionId` comes from the condition filename and is checked against cell `A2`. Checksums are never hard-coded or recalculated by the adapter.

Malformed ZIP/XML structure, an unexpected worksheet/header, filename/condition mismatch, or a non-finite coordinate/temperature produces an explicit parse error. The current `ParsedSpatialRecord` contract requires finite coordinates and temperature, so invalid values cannot be emitted as warning-only records without violating that contract. Valid records carry an empty warnings list.

## Boundaries

The adapter never creates a timestamp, temporal ordering, duration, excursion, shipment, batch, leg or device identity. Conditions are independent controlled experiments and are not joined into a timeline.

This dataset is controlled experimental spatial thermal data. It is not a pharmaceutical shipment, vaccine transport dataset, datalogger vendor export, real cold-chain batch or compliance evidence. No 2–8°C profile or compliance conclusion is applied here.

Downstream spatial normalization maps `ParsedSpatialRecord` to `SpatialMeasurement` while preserving workbook-cell provenance. It does not add temporal or business semantics.
