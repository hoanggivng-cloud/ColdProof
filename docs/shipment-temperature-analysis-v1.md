# Shipment Temperature Analysis v1

## Purpose and MVP position

D11 is a pure, deterministic data-analysis capability for post-transport
Shipment review. The caller supplies canonical measurements and an explicit
Shipment threshold. D11 classifies the measurements and derives directional
sampling-resolution excursion episodes.

```text
Shipment configuration
        │ explicit threshold
        ▼
QA logger file → D10 → CanonicalTimeSeriesMeasurement[]
                              ├── D6 sequence data quality
                              └── D11 temperature analysis
                                         ↓
                                  excursion episodes
```

D11 does not retrieve a Shipment, store data, assign measurements, or make a
QA or compliance decision. TV2 owns persistence and association. TV3 may
present DQ and temperature results independently. QA decides what action, if
any, follows.

**DQ `PASS` does not mean temperature compliance.**

**`EXCURSION_DETECTED` does not mean automatic Shipment rejection.**

## Existing engine compatibility

The legacy `apps/api/src/exceptions/exception-engine.ts` was audited and is
incompatible with the D11 contract. It consumes batch/segment-enriched
measurements, groups all breach directions together, resets on synthetic
segments, measures only first-to-last breach span, and produces business
exception candidates. It does not consume D6 gaps or partition by the D6
device identity.

D11 therefore does not replace, call, or alter the legacy business engine. It
is implemented as a separate pure module in the existing
`@coldproof/runtime-data-pipeline` package. A future backend coordination task
may decide how legacy business behavior is retired or mapped.

## Input

`analyzeShipmentTemperatures()` receives:

- canonical `TIMESERIES` measurements;
- an explicit Celsius threshold;
- an optional D6 `RuntimeDataQualityResult`;
- an optional caller-owned Shipment reference.

The threshold records:

- `min_temperature_c` and `max_temperature_c`;
- `unit = CELSIUS`;
- `threshold_origin`;
- optional `threshold_reference_id`;
- caller-owned threshold policy ID and version.

Supported origins are `SHIPMENT_CONFIGURATION` and
`SYNTHETIC_DEMO_CONTEXT`. D11 never infers a threshold from a product name or
public product reference.

Invalid, non-finite, equal, or reversed thresholds produce a deterministic
`NOT_ASSESSED` validation failure. Values are never swapped silently.

## Inclusive threshold boundaries

V1 freezes inclusive range boundaries:

```text
temperature < minimum  → BELOW_MINIMUM
minimum ≤ temperature ≤ maximum → IN_RANGE
temperature > maximum  → ABOVE_MAXIMUM
```

A sample exactly equal to either threshold is in range.

## Result status

- `NOT_ASSESSED`: invalid input or no canonical temperature measurements.
- `IN_RANGE`: no supplied canonical sample is outside the configured range.
- `EXCURSION_DETECTED`: at least one directional episode exists.

These are analytical states, not QA, regulatory, product-release, or batch
disposition decisions.

## Episode semantics

An episode starts at the first observed out-of-range sample. D11 does not
interpolate an earlier crossing.

When a later sample is in range, `end_at` is that first in-range timestamp and
the derived episode window is `[start_at,end_at)`. This is a
sampling-resolution analysis window. It is not proof that the physical
temperature remained outside the threshold at every instant.

A direct discrete transition from `ABOVE_MAXIMUM` to `BELOW_MINIMUM` closes
the first direction at the new sample timestamp and starts a separate episode
at the same timestamp. D11 does not interpolate through the in-range band.

Each episode retains:

- deterministic `excursion_id`;
- D6-compatible device identity;
- direction;
- start/end and open-ended state;
- first and last out-of-range record references;
- contributing canonical record IDs;
- sample count and extreme value;
- applied threshold value;
- termination reason and continuity state;
- relevant DQ finding IDs;
- D11 policy identity/version.

## Duration semantics

`observed_span_ms` is:

```text
last out-of-range sample time - first out-of-range sample time
```

For a resolved episode, `episode_window_duration_ms` is:

```text
first subsequent boundary sample time - excursion start time
```

A single out-of-range sample can therefore have an observed span of zero and
a non-zero episode window. Neither value is an exact physical exposure
duration.

## Open-ended episodes

If the sequence ends outside the range:

- `end_at = null`;
- `open_ended = true`;
- `episode_window_duration_ms = null`;
- the last out-of-range record and timestamp remain explicit;
- termination is `SEQUENCE_END`.

D11 never invents a closing timestamp.

## Data gaps and DQ independence

D11 does not detect gaps, duplicates, conflicts, or arrival-order anomalies.
It consumes optional D6 results.

When a D6 `MISSING_INTERVAL` reaches an active episode, D11 closes the known
portion with:

- `termination_reason = DATA_GAP`;
- `continuity_uncertain = true`;
- `end_at = null`;
- no episode-window duration.

An out-of-range sample after the gap starts a new episode. Temperature is not
interpolated across missing evidence.

Duplicate/conflict findings remain DQ evidence. D11 does not choose a winning
measurement or mutate canonical values. The result exposes DQ assessment,
finding IDs/codes, and whether reported DQ findings affect interpretation.

All combinations remain valid:

- DQ `PASS` + temperature `IN_RANGE`;
- DQ `PASS` + temperature `EXCURSION_DETECTED`;
- DQ `FLAGGED` + temperature `IN_RANGE`;
- DQ `FLAGGED` + temperature `EXCURSION_DETECTED`.

## Multi-device behavior

D11 uses the D6 device identity tuple:

```text
source_dataset + source_format + source_sensor_id
```

Each stream is sorted and analyzed independently. Input arrays are never
mutated. If any stream contains an episode, the aggregate temperature status
is `EXCURSION_DETECTED`. Devices are never concatenated into one timeline.

## Provenance and determinism

Episode record references extend the existing chain:

```text
temperature episode
  → canonical record ID
  → raw_ingest_id / import_id
  → source row or sheet row
  → original payload/file checksum
```

D11 does not duplicate raw bytes. Excursion IDs are SHA-256-derived from
stable policy, device, direction, timestamps, termination, and contributing
record identities. No random ID or wall-clock time is used.

The algorithm identity is:

- policy ID: `shipment-temperature-analysis-v1`
- policy version: `1.0.0`

## Vietnam healthcare demo expectations

`data/demo/vietnam-healthcare/temperature-analysis-expectations.json` is a
companion artifact; the existing 28 scenarios are unchanged. It defines 20
deterministic temperature-analysis cases and six golden cases.

The demo `2–8°C` range is `SYNTHETIC_DEMO_CONTEXT`. It is not inferred from
Vaxigrip Tetra, Influvac Tetra, Gardasil 9, Prevenar 13, Prevenar 20, or any
other public product identity. Product references and Shipment threshold
configuration remain independent.

## TV1 / TV2 / TV3 boundary

TV1 owns the pure contracts, classification, grouping, conservative duration,
gap interpretation, provenance, and deterministic tests.

TV2 supplies Shipment configuration and canonical/DQ results, then chooses
storage, transaction, association, and authorization behavior. D11 does not
dictate a database model.

TV3 can render the threshold band, stream/episode summaries, DQ findings, and
record provenance independently. D11 provides no UI styling or QA action.

## Limitations

- No interpolation, hysteresis, debounce, or minimum-duration filter.
- No exact physical threshold-crossing or exposure duration claim.
- No product-specific threshold inference.
- No regulatory, GSP/GDP, compliance, release, or disposition verdict.
- No database, NestJS, HTTP, file storage, authorization, or alert delivery.
- Rejected D10 rows are not canonical and are not analyzed.
