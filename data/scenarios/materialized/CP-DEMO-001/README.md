# CP-DEMO-001 materialized scenario

Status: `MATERIALIZED_DRAFT_PENDING_VALIDATION`

This repository scenario pack combines real public physical observations with controlled synthetic logistics context for software evidence testing. It is not a real pharmaceutical shipment, a compliance conclusion, or a QA approval.

## Observed evidence

- SENSOR09 measurements in the approved source-local half-open interval `[2024-09-10T06:00:00,2024-09-10T10:00:00)`.
- Zenodo experiment annotations retained as independent source events. They are not logistics handovers and imply no causal relationship.
- Mendeley C04 and C07 spatial conditions referenced as metadata-only illustrative context. They have no timestamps and are not assigned to legs.

## Synthetic context

The scenario, batch, shipment, four logistics legs, three handovers, and the Zenodo-to-Mendeley illustrative relationship are synthetic. Source measurements, timestamps, values, and raw references are not rewritten.

## Assumption

`DEMO_2_8C` is a ColdProof scenario assumption. Zenodo does not provide it as a pharmaceutical product profile. No authoritative excursion policy or final excursion result is included.

## Canonicalization limitation

The materializer uses the existing ZenodoAdapter for source parsing. The source timestamps have no verified timezone, while CanonicalTimeSeriesMeasurement requires an explicit offset. This pack therefore maps deterministic parsed source-record references and records canonical normalization as pending explicit timezone context. It does not invent UTC, append `Z`, or fabricate an offset.

## Artifact roles

- `scenario.json`: identity, status, origins, and artifact references.
- `source-window.json`: approved evidence binding and source-quality validation.
- `segments.csv`: four synthetic half-open leg definitions.
- `measurement-leg-map.csv`: one deterministic source-record reference per selected observation.
- `handovers.json`: three synthetic scenario boundaries.
- `source-events.json`: independent Zenodo experiment annotations.
- `spatial-context.json`: metadata-only Mendeley C04/C07 references.
- `assumptions.json`: the non-source DEMO_2_8C assumption and unresolved policy fields.
- `provenance.json`: frozen-source, parser, decision, and origin lineage.

The legacy backend fixture that uses `CP-DEMO-001` as a batch ID is not this authoritative repository materialization. This pack does not synchronize with or modify that fixture.
