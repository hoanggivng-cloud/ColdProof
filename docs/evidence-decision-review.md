# Manual Evidence Decision Review

## Scope and decision status

This review compares the five current `ELIGIBLE` and `FULL_PREFERRED_FIT` Zenodo candidates. It produced a recommendation without changing machine-generated `selection_status`, materializing `CP-DEMO-001`, creating synthetic boundaries, or evaluating an excursion/compliance result. The recommendation was subsequently approved in `data/scenarios/design/evidence-decision.json`.

All timestamps below are source-local and timezone-naive. All event labels are observed experimental source terms from `experiment_actions.csv`; they are not logistics handovers or shipment events.

## Review method

`node scripts/review-evidence.mjs` reads the deterministic `SHORTLISTED` rows from `candidate-zenodo-windows.csv`, reparses their frozen raw sensor files, and calculates the review metrics without changing source data or candidate ranking. It separately loads the decision referenced by the blueprint, validates that the approved candidate matches the generated shortlist, and annotates that candidate as the human-approved choice.

- Core metrics use all 2,161 observed records in each inclusive three-hour interval.
- When a minimum or maximum occurs more than once, the review reports first occurrence, last occurrence, and count.
- Baseline is the first 180 observations (15 minutes); post-variation summary is the final 180 observations.
- Local movement uses consecutive, non-overlapping 5-minute temperature means. A rise is at least +0.25°C; a fall is at most -0.25°C. Smaller changes are a deadband, not a movement.
- Largest rise/fall is the largest signed change between adjacent 5-minute means, not a raw 5-second jump.
- Shape labels are deterministic descriptive summaries. `STABLE` means baseline range ≤0.5°C. `PARTIAL_FALL` means the final 15-minute mean is more than 0.5°C below the observed maximum, without claiming return to baseline. `NO_CLEAR_RECOVERY` means the final mean remains within 0.5°C of the maximum after intermediate falls.
- No metric or label is called an excursion.

## Top-five comparison

| Candidate | Min / max / mean | Range | Start → end | Min occurrence | Max occurrence | Gaps | Events |
| --- | --- | ---: | --- | --- | --- | ---: | ---: |
| SENSOR01, 2024-09-06 12:00–15:00 | 10.4 / 39.4 / 19.349931°C | 29.0°C | 22.0 → 36.4°C | 14:00:55 (1) | 14:38:05 (1) | 0 | 9 |
| SENSOR02, 2024-09-06 11:45–14:45 | 9.4 / 37.5 / 17.563073°C | 28.1°C | 20.3 → 32.3°C | 13:16:50–13:17:25 (8) | 14:37:40–14:38:00 (5) | 0 | 10 |
| SENSOR08, 2024-09-04 07:45–10:45 | 11.6 / 18.4 / 14.649977°C | 6.8°C | 11.6 → 18.3°C | 07:45:00–07:48:40 (35) | 10:42:45–10:44:55 (15) | 0 | 5 |
| SENSOR06, 2024-09-04 08:00–11:00 | 8.5 / 14.6 / 11.399861°C | 6.1°C | 8.6 → 13.4°C | 08:02:10 (1) | 10:40:15–10:41:55 (17) | 0 | 5 |
| SENSOR09, 2024-09-10 07:30–10:30 | 5.6 / 11.1 / 8.340491°C | 5.5°C | 6.2 → 11.1°C | 07:56:00 (1) | 10:23:00–10:30:00 (84) | 0 | 5 |

| Candidate | Rises / falls | Largest rise | Largest fall | Baseline mean / range | Final-15-min mean / range | Deterministic thermal shape |
| --- | ---: | --- | --- | --- | --- | --- |
| SENSOR01 | 10 / 15 | +6.695°C, 14:15→14:20 | -4.116667°C, 14:35→14:40 | 22.032222 / 0.2°C | 33.366667 / 5.1°C | `STABLE_THEN_RISE_WITH_PARTIAL_FALL` |
| SENSOR02 | 11 / 13 | +5.768333°C, 14:00→14:05 | -3.848334°C, 12:25→12:30 | 20.406667 / 0.4°C | 35.603333 / 5.3°C | `STABLE_THEN_RISE_WITH_PARTIAL_FALL` |
| SENSOR08 | 12 / 3 | +0.733333°C, 08:40→08:45 | -0.415°C, 10:05→10:10 | 11.852222 / 0.5°C | 17.867222 / 1.3°C | `STABLE_THEN_RISE_WITH_PARTIAL_FALL` |
| SENSOR06 | 11 / 8 | +1.105°C, 10:10→10:15 | -0.811667°C, 09:55→10:00 | 8.79 / 0.5°C | 13.89 / 1.0°C | `STABLE_THEN_RISE_WITH_PARTIAL_FALL` |
| SENSOR09 | 10 / 11 | +1.638334°C, 08:00→08:05 | -0.631667°C, 08:45→08:50 | 6.356667 / 0.4°C | 10.917222 / 1.0°C | `STABLE_THEN_RISE_WITH_INTERMEDIATE_FALLS_NO_CLEAR_RECOVERY` |

## Exact observed experimental source events

Events are included when their source interval overlaps the candidate, including an event that begins before or ends after the candidate boundary.

### SENSOR01 — 2024-09-06 12:00–15:00

| Source-local event time | Source event type | Source reference |
| --- | --- | --- |
| 11:50–12:20 | Door closed | `experiment_actions.csv:row:79` |
| 12:20–12:35 | Door opened | `experiment_actions.csv:row:80` |
| 12:20 | Products in | `experiment_actions.csv:row:81` |
| 12:35–13:15 | Door closed | `experiment_actions.csv:row:82` |
| 13:15–13:30 | Door opened | `experiment_actions.csv:row:83` |
| 13:30–14:00 | Door closed | `experiment_actions.csv:row:84` |
| 14:00–14:30 | Door opened | `experiment_actions.csv:row:85` |
| 14:00 | Products out | `experiment_actions.csv:row:86` |
| 14:30–15:30 | Door closed | `experiment_actions.csv:row:87` |

This candidate has a very large 29°C range and alternating rises/falls. The stable first 15 minutes are followed by multiple experimental actions and strong thermal variation. Its final period remains high, although below its maximum. This provides rich variation but is the most extreme shape in the shortlist and may dominate a demo with a large dynamic range.

### SENSOR02 — 2024-09-06 11:45–14:45

| Source-local event time | Source event type | Source reference |
| --- | --- | --- |
| 11:35–11:50 | Door opened | `experiment_actions.csv:row:78` |
| 11:50–12:20 | Door closed | `experiment_actions.csv:row:79` |
| 12:20–12:35 | Door opened | `experiment_actions.csv:row:80` |
| 12:20 | Products in | `experiment_actions.csv:row:81` |
| 12:35–13:15 | Door closed | `experiment_actions.csv:row:82` |
| 13:15–13:30 | Door opened | `experiment_actions.csv:row:83` |
| 13:30–14:00 | Door closed | `experiment_actions.csv:row:84` |
| 14:00–14:30 | Door opened | `experiment_actions.csv:row:85` |
| 14:00 | Products out | `experiment_actions.csv:row:86` |
| 14:30–15:30 | Door closed | `experiment_actions.csv:row:87` |

This is similar to SENSOR01: a stable baseline precedes large alternating movements and a high final period. It has the largest event count and a 28.1°C range. It is evidence-rich but also highly variable, with the minimum occurring during the middle rather than the baseline.

### SENSOR08 — 2024-09-04 07:45–10:45

| Source-local event time | Source event type | Source reference |
| --- | --- | --- |
| 08:40–09:10 | Door opened | `experiment_actions.csv:row:35` |
| 09:10–10:10 | Door closed | `experiment_actions.csv:row:36` |
| 10:10–10:40 | Door opened | `experiment_actions.csv:row:37` |
| 10:10 | Products in | `experiment_actions.csv:row:38` |
| 10:40–11:40 | Door closed | `experiment_actions.csv:row:39` |

This candidate has a clean low-amplitude rising shape compared with SENSOR01/02. Its baseline is at the accepted stability boundary (0.5°C), and its final period is near the maximum after three detected falls. It is visually simpler, but its full observed interval remains above 8°C.

### SENSOR06 — 2024-09-04 08:00–11:00

| Source-local event time | Source event type | Source reference |
| --- | --- | --- |
| 08:40–09:10 | Door opened | `experiment_actions.csv:row:35` |
| 09:10–10:10 | Door closed | `experiment_actions.csv:row:36` |
| 10:10–10:40 | Door opened | `experiment_actions.csv:row:37` |
| 10:10 | Products in | `experiment_actions.csv:row:38` |
| 10:40–11:40 | Door closed | `experiment_actions.csv:row:39` |

This candidate has moderate variation and a stable baseline, with more alternating movement than SENSOR08. The maximum aligns with the end of the second `Door opened` interval and the start of the final `Door closed` interval, but this is temporal overlap only and is not a causal claim. Its minimum is 8.5°C, so all observed values are above the later demo profile's upper threshold.

### SENSOR09 — 2024-09-10 07:30–10:30

| Source-local event time | Source event type | Source reference |
| --- | --- | --- |
| 08:00–08:30 | Door opened | `experiment_actions.csv:row:116` |
| 08:00 | Products in | `experiment_actions.csv:row:117` |
| 08:30–10:00 | Door closed | `experiment_actions.csv:row:118` |
| 10:00–10:30 | Door opened | `experiment_actions.csv:row:119` |
| 10:30–13:10 | Door closed | `experiment_actions.csv:row:120` |

This candidate has the smallest range in the shortlist but still shows a stable initial period, a clear source-event-aligned rise, intermediate falls, and later renewed rise. The window ends at its observed maximum; it does not show a clear return toward the initial baseline.

## SENSOR09 special review

| Period | Observations | Min / max / mean | Range | Interpretation |
| --- | ---: | --- | ---: | --- |
| 07:30–08:00 | 360 | 5.6 / 6.6 / 6.181944°C | 1.0°C | Relatively low pre-event period; the first 15 minutes are more stable at 6.356667°C mean and 0.4°C range. Minimum occurs at 07:56. |
| 08:00–08:30 | 360 | 6.0 / 10.9 / 9.443889°C | 4.9°C | Strong rise during the observed `Door opened` interval; largest 5-minute-mean rise is +1.638334°C from 08:00 to 08:05. Temporal alignment is not a causal or logistics claim. |
| 08:30–10:30 | 1,441 | 6.5 / 11.1 / 8.604094°C | 4.6°C | Contains intermediate falls and renewed rises. The last 15-minute mean is 10.917222°C, and the maximum persists from 10:23 to the 10:30 boundary. There is no clear return to baseline. |

SENSOR09 therefore does support `baseline → variation → post-variation behavior` in the blueprint's descriptive sense. Its post-variation behavior is not a recovery: after intermediate cooling, temperature rises again and the interval ends at the maximum. The events at 08:00 and 10:00 are observed experimental source events only.

## Potential suitability for later rule-engine demonstration

This section is a **DESIGN SUITABILITY REVIEW**, not a source fact, compliance evaluation, excursion result, or change to candidate ranking. `DEMO_2_8C` remains an explicit later assumption.

- SENSOR01, SENSOR02, SENSOR08, and SENSOR06 have all 2,161 observed values above 8°C. They could exercise a persistent-above-threshold software path, but do not demonstrate an observed crossing from at/below 8°C to above 8°C inside these windows.
- SENSOR09 spans the 8°C upper threshold: 1,101 observations are at or below 8°C and 1,060 are above 8°C. The first observed upward transition is at 08:05:45 (8.1°C). There are 13 state transitions because values later oscillate around 8.0/8.1°C before the final upward transition at 10:01:00.
- These counts describe observed values relative to a hypothetical later rule input. No duration, excursion flag, compliance status, or disposition is calculated here.

## Approved human decision

**Approved: SENSOR09, 2024-09-10T07:30:00–10:30:00.** The original recommendation was approved by `evidence-decision.json` v1.0.0. The candidate remains `SHORTLISTED` in the generated CSV because human approval is an authoritative overlay, not a candidate-generation result.

Why it is preferred:

1. Profile-neutral evidence is clean: one sensor, 2,161 regular observations, zero internal gaps, stable first-15-minute baseline, meaningful but moderate 5.5°C range, and five traceable source events.
2. Its thermal story is interpretable without changing data: relatively low baseline, clear rise aligned in time with documented experiment activity, intermediate post-event falls, and a later rise. The review explicitly avoids inventing recovery.
3. It is less extreme than SENSOR01/02, making source behavior easier to inspect without a 28–29°C dynamic range dominating the demonstration.
4. Compared with SENSOR08/06, it contains observed values on both sides of 8°C. This is useful only as later rule-engine design suitability and did not alter evidence-selection ranking.
5. Its limitations are visible rather than hidden: repeated near-threshold transitions and the high end-of-window state create meaningful cases for later policy semantics and review.

Why not the other four:

- **SENSOR01:** strongest thermal/event score, but its 29°C range and large alternating movements are comparatively extreme; the final period remains very high.
- **SENSOR02:** similarly evidence-rich, but has a 28.1°C range and complex mid-window minimum, making a concise human narrative harder.
- **SENSOR08:** simplest gradual rise and a strong alternative for a profile-neutral visualization, but the entire window is above 8°C and its largest 5-minute rise is only 0.733333°C.
- **SENSOR06:** moderate and traceable, but every observed value is above 8°C and the baseline begins at 8.5°C; it offers less rule-engine state diversity than SENSOR09.

## Limitations requiring human acceptance

- Human approval is recorded only in `evidence-decision.json`; it does not update machine-generated candidate `selection_status` or ranking.
- Zenodo is cold-storage-room evidence, not a pharmaceutical shipment or logistics journey.
- Source timestamps have no declared timezone; no timezone was added.
- Source event overlap is temporal evidence, not proof of causality and not a logistics mapping.
- SENSOR09 does not show a clear recovery or return to baseline and ends at its maximum.
- The 13 threshold-state transitions include near-threshold 8.0/8.1°C oscillation. Later rule semantics must handle this explicitly rather than smoothing it away.
- No segment boundaries, handovers, excursion durations, or compliance findings are created by this review.
