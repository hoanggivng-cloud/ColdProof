# Evidence Selection v1

## 1. Scope and decision boundary

This work verifies Mendeley condition semantics and profiles Zenodo source-local time-series windows. It does not materialize `CP-DEMO-001`, assign logistics meaning, apply `DEMO_2_8C`, calculate excursions, or create segment boundaries.

The scenario blueprint loaded and validated successfully. Candidate generation does not mark a row `SELECTED`; `candidate-zenodo-windows.csv` remains the deterministic machine shortlist. Human approval is stored separately in `data/scenarios/design/evidence-decision.json`. Decision v1.0.0 subsequently approved SENSOR09 for the source-local interval `2024-09-10T07:30:00–10:30:00`.

Blueprint metadata:

- Blueprint ID: `CP-DEMO-BLUEPRINT-001`
- Blueprint version: `0.1.0`
- Blueprint status: `DRAFT`
- Preferred replay mode: `SINGLE_CONTINUOUS_SOURCE_INTERVAL`
- Synthetic segment count: `4`
- Zenodo role: `PRIMARY_TIME_SERIES_EVIDENCE`
- Mendeley role: `SUPPLEMENTAL_ILLUSTRATIVE_CONTEXT`
- `DEMO_2_8C`: an `ASSUMPTION` for later software rule evaluation; natural compliance with it is explicitly not required for evidence selection.
- Mapping restrictions: Zenodo timestamps and measurement values cannot be rewritten; Mendeley cannot participate in excursion calculation.

## 2. Method

The selection run reads the frozen, ignored observed assets without modifying them:

- Zenodo `SENSOR01.CSV` through `SENSOR09.CSV` and `experiment_actions.csv`.
- Mendeley C01-C13 workbooks and `Experimental conditions.docx`.
- `data/manifests/source_manifest.csv` for frozen file identity and provenance.

`node scripts/select-evidence.mjs` first parses and validates `scenario-blueprint.json`, then deterministically regenerates `candidate-zenodo-windows.csv`. Missing, empty, invalid, or incomplete blueprint input stops the run before profiling output is written. `node scripts/select-evidence.mjs --check` verifies that the committed artifact is reproducible.

Zenodo timestamps remain source-local `YYYY-MM-DDTHH:mm:ss`. The script uses UTC calendar arithmetic only as a timezone-neutral numeric index for differences; it never appends `Z` or an offset and makes no timezone claim. The existing `DataQualityService` consumes timezone-bearing canonical measurements, so invoking it here would require an unsupported timezone assumption. The selector therefore applies the same v1 continuity definitions directly to parsed source-local timestamps: 5-second expected interval, zero tolerance, duplicate equality, and source-order decrease.

## 3. Mendeley condition crosswalk

The DOCX condition table, workbook metadata rows, and source filenames agree on the following condition configuration:

| Conditions | Source-supported interpretation |
| --- | --- |
| C01-C03 | Empty-box experiments; PCM at side wall/top; horizontal or vertical orientation |
| C04-C06 | 20°C ambient, 4°C initial load, 20 mm gap; side/top and horizontal/vertical variants |
| C07 | 30°C ambient, 4°C initial load, 20 mm gap, horizontal/side-wall PCM |
| C08 | 10°C ambient, 4°C initial load, 20 mm gap, horizontal/top PCM |
| C09 | 30°C ambient, 4°C initial load, 20 mm gap, horizontal/top PCM |
| C10-C11 | 20°C ambient, 10°C initial load, 20 mm gap; horizontal side/top variants |
| C12-C13 | 20°C ambient, 4°C initial load, no gap; horizontal side/top variants |

All workbooks use worksheet `Feuil1`, identify the measurement plane as `Middle plane (X = 250 mm)`, label the matrix `Average temperature (°C)`, and encode Y/Z coordinates in millimetres.

Crosswalk status:

- `VERIFIED`: 0
- `PARTIALLY_VERIFIED`: 13
- `UNVERIFIED`: 0

The configurations are corroborated, but all conditions remain `PARTIALLY_VERIFIED` because the supplied source does not identify the measurement medium or document the averaging method/window. “Average temperature” is retained as a source label; the evidence does not establish whether each matrix value is a direct point measurement or a summary over repeated measurements. C01-C13 are experimental conditions, not devices, vendors, shipments, or chronological legs.

## 4. Zenodo profiling methodology

The selector scans every continuous source run and considers windows of 60, 90, 120, and 180 minutes. Starts are aligned to a deterministic 15-minute source-local grid. A candidate is generated only when every expected 5-second observation exists from start through end, inclusive.

For each candidate:

- Descriptive temperature and humidity metrics use the observed values only.
- `thermal_variation_score` is `temperature_range_c + maximum absolute change between consecutive non-overlapping 5-minute temperature means`.
- `has_pre_variation_baseline` is true when the first 15-minute temperature range is at most 0.5°C.
- `has_post_variation_behavior` is true when at least 15 minutes remain after the largest 5-minute mean change and the absolute difference between the first and last 15-minute means is at least 0.25°C.
- Blueprint `meaningful thermal variation` is satisfied only when the documented `thermal_variation_score` is greater than zero.
- `selection_score` is the thermal variation score plus 0.25 per overlapping documented source event, capped at four events. This numeric value is only a deterministic tie-breaker.

Selection is applied in three layers:

1. **Eligibility:** evaluate all blueprint-required Zenodo criteria: frozen raw provenance, source continuity, duration divisible into four non-empty synthetic segments, observed-only temperatures, and no unresolved malformed rows.
2. **Blueprint fit:** count the blueprint-preferred criteria satisfied. This includes one sensor, regular 5-second sampling, no internal gap, thermal variation, event metadata, baseline, and post-variation behavior.
3. **Deterministic score:** compare thermal/event scores only after eligibility and blueprint fit. A higher numeric score cannot override a failed requirement or a lower blueprint-fit score.

These are deterministic descriptive heuristics, not ML, excursion detection, or compliance evaluation. One best blueprint-fitted window per sensor is retained for human review. The top five per-sensor candidates are `SHORTLISTED`; the remaining per-sensor candidates are `REJECTED` by relative rank. Separate gap-audit rows demonstrate `SOURCE_MISSING_INTERVAL`, fail eligibility, and are always rejected. `DEMO_2_8C` thresholds are not inputs to any of these layers.

## 5. Full-source run

Nine sensors and 1,083,195 measurement rows were scanned. The parser found no malformed measurement rows, duplicate timestamps, or out-of-order timestamps. It considered 23,768 continuous candidates.

Source DQ summary:

| Sensor | Measurements | Missing intervals | Expected missing samples | Duplicates | Out of order |
| --- | ---: | ---: | ---: | ---: | ---: |
| SENSOR01 | 156,019 | 1 | 966 | 0 | 0 |
| SENSOR02 | 156,980 | 0 | 0 | 0 | 0 |
| SENSOR03 | 84,450 | 2 | 72,476 | 0 | 0 |
| SENSOR04 | 151,248 | 0 | 0 | 0 | 0 |
| SENSOR05 | 31,146 | 0 | 0 | 0 | 0 |
| SENSOR06 | 156,887 | 0 | 0 | 0 | 0 |
| SENSOR07 | 156,885 | 0 | 0 | 0 | 0 |
| SENSOR08 | 156,863 | 0 | 0 | 0 | 0 |
| SENSOR09 | 32,717 | 0 | 0 | 0 | 0 |

The three source gaps are retained in the CSV as rejected audit candidates:

- SENSOR01: 4,835-second observed gap, 966 expected samples absent.
- SENSOR03: 95-second observed gap, 18 expected samples absent.
- SENSOR03: 362,295-second observed gap, 72,458 expected samples absent. Its audit window also contains the earlier SENSOR03 gap, so the row-level total is two intervals and 72,476 missing samples.

These are gaps between observed records. Data omitted outside a selected candidate is a `WINDOW_SELECTION_GAP`, not source missing data. Future synthetic segment boundaries would be `REPLAY_BOUNDARY`, not source gaps.

## 6. Candidate ranking and decision

| Rank | Candidate | Sensor | Source-local interval | Duration | Blueprint fit | Thermal/event score | Status |
| ---: | --- | --- | --- | ---: | ---: | ---: | --- |
| 1 | ZEN-01-20240906T120000-180M | SENSOR01 | 2024-09-06 12:00-15:00 | 180 min | 7/7 | 36.695 | SHORTLISTED |
| 2 | ZEN-02-20240906T114500-180M | SENSOR02 | 2024-09-06 11:45-14:45 | 180 min | 7/7 | 34.868333 | SHORTLISTED |
| 3 | ZEN-08-20240904T074500-180M | SENSOR08 | 2024-09-04 07:45-10:45 | 180 min | 7/7 | 8.533333 | SHORTLISTED |
| 4 | ZEN-06-20240904T080000-180M | SENSOR06 | 2024-09-04 08:00-11:00 | 180 min | 7/7 | 8.205 | SHORTLISTED |
| 5 | ZEN-09-20240910T073000-180M | SENSOR09 | 2024-09-10 07:30-10:30 | 180 min | 7/7 | 8.138333 | SHORTLISTED |
| 6 | ZEN-04-20240904T074500-180M | SENSOR04 | 2024-09-04 07:45-10:45 | 180 min | 7/7 | 7.953333 | REJECTED |
| 7 | ZEN-07-20240904T081500-180M | SENSOR07 | 2024-09-04 08:15-11:15 | 180 min | 7/7 | 7.75 | REJECTED |
| 8 | ZEN-03-20240909T080000-180M | SENSOR03 | 2024-09-09 08:00-11:00 | 180 min | 7/7 | 7.541667 | REJECTED |
| 9 | ZEN-05-20240910T074500-180M | SENSOR05 | 2024-09-10 07:45-10:45 | 180 min | 7/7 | 5.196667 | REJECTED |

The machine-generated artifact has no `SELECTED` row by design. Its result is five `SHORTLISTED` candidates with unchanged eligibility, blueprint fit, scores, and ranking. The authoritative human overlay in `evidence-decision.json` has status `APPROVED` and selects `ZEN-09-20240910T073000-180M` without mutating this table.

The source supports `SINGLE_CONTINUOUS_SOURCE_INTERVAL`: each shortlisted row is a one-sensor, 180-minute, exactly 5-second interval with 2,161 observations, zero internal gaps, zero duplicates, zero out-of-order records, thermal variation, and documented source-event overlap. A composite replay is not currently required by evidence availability.

All retained per-sensor winners satisfy all seven preferred criteria. The ranking therefore falls through to the deterministic thermal/event score. Rank 1 is not automatically the golden candidate: its large observed variation drives the tie-breaker, and scientific/narrative suitability still requires human review.

## 7. Source-event overlap

Event counts and exact `experiment_actions.csv` physical row references are recorded in the candidate CSV. The actions include source terms such as `Begin`, `Door opened`, `Door closed`, `Products in`, and `Products out`. They remain documented experimental events. In particular, a door action is not a logistics handover, and products-in/out is not evidence of a real shipment event.

## 8. Scientific and provenance limitations

- Zenodo records are cold-storage-room observations, not evidence of a pharmaceutical shipment or a real batch journey.
- Source timezone is not declared by the parsed CSV fields; all evidence timestamps remain timezone-naive and source-local.
- Thermal variation is not an excursion and has no compliance meaning without a separately governed product profile.
- Mendeley is controlled experimental spatial thermal data. Its conditions cannot be converted into logistics legs or chronological events.
- Mendeley measurement-medium and aggregation-method semantics remain unresolved.
- Candidate selection excludes observations outside each window by design; that does not make those observations missing from the source.

## 9. Blueprint refinement and next step

The current blueprint is operational for Zenodo eligibility and shortlist generation; no structural refinement is required to establish that `SINGLE_CONTINUOUS_SOURCE_INTERVAL` is feasible. It remains `DRAFT`. Its time-series selection status is `RESOLVED_BY_EVIDENCE_DECISION` and references `data/scenarios/design/evidence-decision.json`, which is the only authoritative location for the approved sensor and exact window.

One evidence issue remains for the Mendeley side of the blueprint: condition identity and cell provenance are available, but the source does not fully document measurement medium or averaging semantics. Before materialization, either obtain stronger source documentation or explicitly accept this limitation while keeping Mendeley in its declared `SUPPLEMENTAL_ILLUSTRATIVE_CONTEXT` role.

The manual review is complete and decision v1.0.0 approved SENSOR09 `2024-09-10T07:30:00–10:30:00`. The next scoped phase may use that decision for Scenario Materialization; synthetic replay boundaries remain undefined. No observed values, timestamps, or gaps need to change, and no composite replay is indicated by the current evidence.
