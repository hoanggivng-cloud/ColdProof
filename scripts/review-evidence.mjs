import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import core from './evidence-selection-core.cjs';

const {
  loadBlueprint,
  loadEvidenceDecision,
  parseExperimentActions,
  parseZenodoCsv,
  resolveApprovedCandidate,
  validateApprovedSourceInterval,
} = core;

const MOVEMENT_THRESHOLD_C = 0.25;
const BIN_SECONDS = 300;
const BASELINE_SECONDS = 900;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted field.');
  if (row.length > 0 || field !== '') {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }

  const headers = rows.shift();
  if (!headers) throw new Error('CSV is empty.');
  return rows
    .filter((values) => values.some((value) => value !== ''))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function summarize(records) {
  const values = records.map((record) => record.temperatureC);
  return {
    observationCount: records.length,
    minTemperatureC: round(Math.min(...values)),
    maxTemperatureC: round(Math.max(...values)),
    meanTemperatureC: round(mean(values)),
    temperatureRangeC: round(Math.max(...values) - Math.min(...values)),
  };
}

function occurrenceSummary(records, target) {
  const matches = records.filter((record) => record.temperatureC === target);
  return {
    firstTimestamp: matches[0].timestamp,
    lastTimestamp: matches.at(-1).timestamp,
    occurrenceCount: matches.length,
  };
}

function createFiveMinuteBins(records) {
  const startTimeMs = records[0].arithmeticTimeMs;
  const endTimeMs = records.at(-1).arithmeticTimeMs;
  const bins = [];
  for (let binStartMs = startTimeMs; binStartMs < endTimeMs; binStartMs += BIN_SECONDS * 1000) {
    const binEndMs = binStartMs + BIN_SECONDS * 1000;
    const binRecords = records.filter(
      (record) => record.arithmeticTimeMs >= binStartMs && record.arithmeticTimeMs < binEndMs,
    );
    bins.push({
      startTimestamp: binRecords[0].timestamp,
      endTimestamp: binRecords.at(-1).timestamp,
      meanTemperatureC: round(mean(binRecords.map((record) => record.temperatureC))),
    });
  }
  return bins;
}

function movementSummary(bins) {
  const movements = bins.slice(1).map((bin, index) => ({
    fromTimestamp: bins[index].startTimestamp,
    toTimestamp: bin.startTimestamp,
    deltaC: round(bin.meanTemperatureC - bins[index].meanTemperatureC),
  }));
  const rises = movements.filter((movement) => movement.deltaC >= MOVEMENT_THRESHOLD_C);
  const falls = movements.filter((movement) => movement.deltaC <= -MOVEMENT_THRESHOLD_C);
  const largestRise = rises.length === 0
    ? null
    : rises.reduce((largest, movement) => (movement.deltaC > largest.deltaC ? movement : largest));
  const largestFall = falls.length === 0
    ? null
    : falls.reduce((largest, movement) => (movement.deltaC < largest.deltaC ? movement : largest));
  return {
    localRiseCount: rises.length,
    localFallCount: falls.length,
    largestObservedRise: largestRise,
    largestObservedFall: largestFall,
  };
}

function summarizePeriod(records, startTimeMs, endTimeMs, includeEnd = false) {
  const selected = records.filter(
    (record) =>
      record.arithmeticTimeMs >= startTimeMs &&
      (includeEnd ? record.arithmeticTimeMs <= endTimeMs : record.arithmeticTimeMs < endTimeMs),
  );
  return summarize(selected);
}

function classifyShape(summary, movements, baseline, postVariation) {
  const netChangeC = round(summary.endTemperatureC - summary.startTemperatureC);
  const hasRise = movements.localRiseCount > 0;
  const hasFall = movements.localFallCount > 0;
  const stableBaseline = baseline.temperatureRangeC <= 0.5;
  const postNearPeak = postVariation.meanTemperatureC >= summary.maxTemperatureC - 0.5;

  if (stableBaseline && hasRise && hasFall && postNearPeak) {
    return 'STABLE_THEN_RISE_WITH_INTERMEDIATE_FALLS_NO_CLEAR_RECOVERY';
  }
  if (stableBaseline && hasRise && hasFall) return 'STABLE_THEN_RISE_WITH_PARTIAL_FALL';
  if (stableBaseline && hasRise && !hasFall) return 'STABLE_THEN_RISE';
  if (hasRise && hasFall && summary.temperatureRangeC >= 10) return 'HIGH_VARIABILITY_RISE_AND_FALL';
  if (hasRise && hasFall) return 'RISE_THEN_FALL_PATTERN';
  if (netChangeC >= MOVEMENT_THRESHOLD_C) return 'NET_RISE';
  if (netChangeC <= -MOVEMENT_THRESHOLD_C) return 'NET_FALL';
  return 'LOW_NET_CHANGE';
}

function thresholdSuitability(records, upperThresholdC) {
  const transitions = [];
  for (let index = 1; index < records.length; index += 1) {
    const previousAbove = records[index - 1].temperatureC > upperThresholdC;
    const currentAbove = records[index].temperatureC > upperThresholdC;
    if (previousAbove !== currentAbove) {
      transitions.push({
        timestamp: records[index].timestamp,
        direction: currentAbove ? 'TO_ABOVE_UPPER_THRESHOLD' : 'TO_AT_OR_BELOW_UPPER_THRESHOLD',
        observedTemperatureC: records[index].temperatureC,
      });
    }
  }
  const aboveCount = records.filter((record) => record.temperatureC > upperThresholdC).length;
  return {
    reviewClassification:
      aboveCount === 0
        ? 'NO_VALUES_ABOVE_UPPER_THRESHOLD'
        : aboveCount === records.length
          ? 'ALL_VALUES_ABOVE_UPPER_THRESHOLD'
          : 'SPANS_UPPER_THRESHOLD',
    aboveObservationCount: aboveCount,
    atOrBelowObservationCount: records.length - aboveCount,
    transitionCount: transitions.length,
    transitions,
  };
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidatePath = path.join(repoRoot, 'data/scenarios/design/candidate-zenodo-windows.csv');
const rawDirectory = path.join(repoRoot, 'data/observed/zenodo/raw');
const eventPath = path.join(repoRoot, 'data/observed/zenodo/metadata/experiment_actions.csv');
const blueprintPath = path.join(repoRoot, 'data/scenarios/design/scenario-blueprint.json');

const allCandidates = parseCsv(await readFile(candidatePath, 'utf8'));
const candidates = allCandidates.filter(
  (candidate) => candidate.selection_status === 'SHORTLISTED',
);
if (candidates.length === 0) throw new Error('Generated candidate shortlist is empty.');

const events = parseExperimentActions(await readFile(eventPath, 'utf8'));
const blueprint = loadBlueprint(await readFile(blueprintPath, 'utf8'));
const decisionRef = blueprint.observed_evidence.time_series.evidence_decision_ref;
const decisionPath = path.resolve(repoRoot, decisionRef);
if (!decisionPath.startsWith(`${repoRoot}${path.sep}`)) {
  throw new Error(`Evidence decision reference escapes the repository: ${decisionRef}`);
}
const decision = loadEvidenceDecision(await readFile(decisionPath, 'utf8'));
const selectedEvidence = decision.selected_time_series_evidence;
const expectedIntervalSeconds =
  blueprint.assumptions.data_quality_policy.expected_interval_seconds;
const authoritativeSource = parseZenodoCsv(
  await readFile(path.join(rawDirectory, selectedEvidence.source_file), 'utf8'),
  selectedEvidence.source_file,
);
const approvedSourceInterval = validateApprovedSourceInterval(
  authoritativeSource,
  decision,
  blueprint,
  expectedIntervalSeconds,
);

const priorDecisionPath = path.resolve(repoRoot, decision.prior_decision_ref);
if (!priorDecisionPath.startsWith(`${repoRoot}${path.sep}`)) {
  throw new Error(`Prior evidence decision reference escapes the repository: ${decision.prior_decision_ref}`);
}
const priorDecision = loadEvidenceDecision(await readFile(priorDecisionPath, 'utf8'));
const historicalCandidate = resolveApprovedCandidate(allCandidates, priorDecision, blueprint);
const demoUpperThresholdC = blueprint.assumptions.product_profile.upper_threshold_c;
const reviews = [];
for (const candidate of candidates) {
  const source = parseZenodoCsv(
    await readFile(path.join(rawDirectory, candidate.source_file), 'utf8'),
    candidate.source_file,
  );
  const records = source.records.filter(
    (record) =>
      record.timestamp >= candidate.start_timestamp && record.timestamp <= candidate.end_timestamp,
  );
  const summary = summarize(records);
  const startTimeMs = records[0].arithmeticTimeMs;
  const endTimeMs = records.at(-1).arithmeticTimeMs;
  const bins = createFiveMinuteBins(records);
  const movements = movementSummary(bins);
  const baseline = summarizePeriod(
    records,
    startTimeMs,
    startTimeMs + BASELINE_SECONDS * 1000,
  );
  const postVariation = summarize(records.slice(-(BASELINE_SECONDS / 5)));
  const overlappingEvents = events.filter(
    (event) => event.startTimeMs <= endTimeMs && event.endTimeMs >= startTimeMs,
  );
  const review = {
    candidateId: candidate.candidate_id,
    sensorId: candidate.sensor_id,
    sourceFile: candidate.source_file,
    startTimestamp: candidate.start_timestamp,
    endTimestamp: candidate.end_timestamp,
    ...summary,
    startTemperatureC: records[0].temperatureC,
    endTemperatureC: records.at(-1).temperatureC,
    minOccurrence: occurrenceSummary(records, summary.minTemperatureC),
    maxOccurrence: occurrenceSummary(records, summary.maxTemperatureC),
    ...movements,
    baseline,
    postVariation,
    internalGapCount: Number(candidate.internal_missing_interval_count),
    eventCount: overlappingEvents.length,
    events: overlappingEvents,
    humanDecisionStatus:
      candidate.candidate_id === historicalCandidate.candidate_id
        ? 'SUPERSEDED_HISTORICAL_DECISION'
        : 'NOT_SELECTED',
    designSuitabilityOnly: thresholdSuitability(records, demoUpperThresholdC),
  };
  review.thermalShape = classifyShape(review, movements, baseline, postVariation);
  reviews.push(review);
}

const approvedRecords = approvedSourceInterval.records;
const approvedStartTimeMs = approvedRecords[0].arithmeticTimeMs;
const approvedEndTimeMs =
  approvedRecords.at(-1).arithmeticTimeMs + expectedIntervalSeconds * 1000;
const approvedEvents = events.filter(
  (event) => event.startTimeMs < approvedEndTimeMs && event.endTimeMs >= approvedStartTimeMs,
);
const authoritativeEvidenceReview = {
  sourceValidationStatus: 'PASS',
  sensorId: selectedEvidence.sensor_id,
  sourceFile: selectedEvidence.source_file,
  startTimestamp: selectedEvidence.start_timestamp,
  endTimestamp: selectedEvidence.end_timestamp,
  intervalSemantics: selectedEvidence.interval_semantics,
  ...summarize(approvedRecords),
  firstSourceRef: approvedSourceInterval.firstRecord.rawRef,
  lastSourceRef: approvedSourceInterval.lastRecord.rawRef,
  continuity: approvedSourceInterval.continuity,
  eventCount: approvedEvents.length,
  events: approvedEvents,
  designSuitabilityOnly: thresholdSuitability(approvedRecords, demoUpperThresholdC),
};

console.log(JSON.stringify({
  approvedDecision: {
    decisionVersion: decision.decision_version,
    decisionStatus: decision.decision_status,
    decisionOrigin: decision.decision_origin,
    sensorId: selectedEvidence.sensor_id,
    sourceFile: selectedEvidence.source_file,
    startTimestamp: selectedEvidence.start_timestamp,
    endTimestamp: selectedEvidence.end_timestamp,
    intervalSemantics: selectedEvidence.interval_semantics,
    observationCount: selectedEvidence.observation_count,
    timezoneStatus: selectedEvidence.timezone_status,
    knownLimitations: decision.known_limitations,
  },
  historicalDecision: {
    decisionVersion: priorDecision.decision_version,
    decisionStatus: 'SUPERSEDED_HISTORICAL_PROVENANCE',
    candidateId: priorDecision.selected_time_series_evidence.candidate_id,
    sensorId: priorDecision.selected_time_series_evidence.sensor_id,
    startTimestamp: priorDecision.selected_time_series_evidence.start_timestamp,
    endTimestamp: priorDecision.selected_time_series_evidence.end_timestamp,
  },
  method: {
    binSeconds: BIN_SECONDS,
    movementThresholdC: MOVEMENT_THRESHOLD_C,
    baselineSeconds: BASELINE_SECONDS,
    expectedIntervalSeconds,
    demoUpperThresholdC,
    demoThresholdAffectsCandidateRanking: false,
  },
  authoritativeEvidenceReview,
  reviews,
}, null, 2));
