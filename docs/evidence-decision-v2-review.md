# Evidence Decision v2 Proposal Review

## Decision state

**CURRENT APPROVED:** SENSOR09, `2024-09-10T07:30:00–10:30:00`, Evidence Decision v1.0.0.

**PROPOSED:** SENSOR09, `2024-09-10T06:00:00–10:00:00`, Evidence Decision v2.0.0 draft.

The proposal has status `PROPOSED_PENDING_TEAM_REVIEW`. It does not supersede or modify the approved v1 artifact. `data/scenarios/design/evidence-decision.json` remains authoritative, and the scenario blueprint continues to reference it. The proposal is recorded separately in `data/scenarios/design/evidence-decision-v2.draft.json` and requires an explicit team decision before it can affect materialization.

The approved v1 decision was introduced by Git commit `ef3a1cc7bc996600f3febda2154a5e5dc68cfa9e`. The draft records both that commit and the path of the prior authoritative artifact.

## Exact interval comparison

All timestamps are source-local with `UNKNOWN_SOURCE_LOCAL` timezone status. No timezone has been added.

| Representation | Interval semantics | Observations | First included | Last included | Min / max | Reference `T > 8°C` |
| --- | --- | ---: | --- | --- | --- | ---: |
| Approved v1 evidence-selection representation | `[07:30,10:30]` | 2,161 | 07:30:00 | 10:30:00 | 5.6 / 11.1°C | 1,060 |
| v1 scenario-materialization interpretation | `[07:30,10:30)` | 2,160 | 07:30:00 | 10:29:55 | 5.6 / 11.1°C | 1,059 |
| Proposed v2 | `[06:00,10:00)` | 2,880 | 06:00:00 | 09:59:55 | 5.6 / 10.9°C | 711 |

The historical Evidence Selection artifact counted both endpoints and therefore recorded 2,161 observations. Scenario materialization uses the blueprint's half-open `[start,end)` convention, so the same v1 clock bounds yield 2,160 included observations. The exact `2024-09-10T10:30:00` observation at `SENSOR09.CSV` `row:14762` has not been deleted or changed; it remains in the frozen source and is excluded only by half-open interval semantics.

This is a real evidence-scope change, not a presentation edit: v2 begins 90 minutes earlier, ends 30 minutes earlier, and contains 720 more materialized observations than the half-open v1 interpretation.

## Frozen-source verification

The proposed interval was recomputed directly from frozen asset `ZEN-RAW-S09`, SHA-256 `c50253f87996f050a0bbda5eeb383775f077b1db8ccf1b38ea52e78498f2a2ed`:

- 2,880 observations satisfy `06:00:00 <= timestamp < 10:00:00`.
- Cadence is consistently 5 seconds.
- Internal missing intervals: 0.
- Duplicate timestamps: 0.
- Out-of-order timestamps: 0.
- Included physical rows run from `row:11522` through `row:14401`.
- Observed temperature range is 5.6–10.9°C.

For a reference-only `DEMO_2_8C` design comparison, 711 observations are above 8°C, 0 are below 2°C, and there are 6 observed high runs under the exact rule `T > 8°C`. This does not alter evidence ranking, create an excursion, or make a compliance claim. `DEMO_2_8C` remains an assumption rather than a source fact.

The largest high run spans `08:05:45–09:01:30` with 670 observations and a maximum of 10.9°C. It continues after the observed `Door closed` annotation begins at 08:30. This is temporal overlap only; it does not establish that the event caused the thermal behavior.

## Observed experimental source events

These are `REAL_PUBLIC_DATA` experiment annotations from `experiment_actions.csv`, not synthetic logistics boundaries:

| Source-local time | Source event type | Source reference | Relationship to v2 |
| --- | --- | --- | --- |
| 08:00–08:30 | Door opened | `experiment_actions.csv:row:116` | Overlaps proposed interval |
| 08:00 | Products in | `experiment_actions.csv:row:117` | Overlaps proposed interval |
| 08:30–10:00 | Door closed | `experiment_actions.csv:row:118` | Overlaps proposed interval up to its end boundary |
| 10:00–10:30 | Door opened | `experiment_actions.csv:row:119` | Begins at excluded end boundary; not included |

The proposal does not translate `Door opened`, `Door closed`, or `Products in` into a handover, shipment event, or causal explanation. Synthetic logistics boundaries do not exist in this task.

## Proposal rationale

The `06:00–10:00` window provides a longer observed pre-variation baseline while retaining one continuous source interval, one sensor, and one frozen source file. It contains interpretable thermal variation and observed post-variation behavior before a new experiment annotation starts at the excluded 10:00 boundary.

This rationale concerns benchmark and demonstration design suitability only. It does not claim better shipment quality, a safer shipment, real logistics meaning, pharmaceutical validity, or a causal relationship between source event annotations and temperature.

## Limitations and future use

- Zenodo records cold-storage-room observations, not a pharmaceutical shipment.
- Source timestamps have no verified timezone.
- The reference threshold comparison is not evidence ranking and not compliance evaluation.
- No excursion duration, synthetic handover, segment boundary, scenario pack, or business context is created here.
- The major observed high run continues beyond the start of the source `Door closed` annotation; the proposal does not call that a recovery.
- If v2 is later approved, the approved v1 `07:30–10:30` interval may remain useful as a secondary/right-censored regression case. That regression case is not implemented here.

## Approval required

The current approved evidence remains v1 `07:30–10:30`. The proposed v2 `06:00–10:00` interval cannot become authoritative until the team explicitly reviews and approves it in a separate change. Candidate ranking and the deterministic candidate CSV remain unchanged.
