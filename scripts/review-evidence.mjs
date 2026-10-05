import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import core from './evidence-selection-core.cjs';

const { loadBlueprint, parseExperimentActions, parseZenodoCsv } = core;

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

const candidates = parseCsv(await readFile(candidatePath, 'utf8')).filter(
  (candidate) => candidate.selection_status === 'SHORTLISTED',
);
if (candidates.length !== 5) {
  throw new Error(`Expected exactly five SHORTLISTED candidates; found ${candidates.length}.`);
}

const events = parseExperimentActions(await readFile(eventPath, 'utf8'));
const blueprint = loadBlueprint(await readFile(blueprintPath, 'utf8'));
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
    designSuitabilityOnly: thresholdSuitability(records, demoUpperThresholdC),
  };
  review.thermalShape = classifyShape(review, movements, baseline, postVariation);
  reviews.push(review);
}

const sensor09 = reviews.find((review) => review.sensorId === 'SENSOR09');
if (!sensor09) throw new Error('SENSOR09 shortlist review is missing.');
const sensor09Records = parseZenodoCsv(
  await readFile(path.join(rawDirectory, sensor09.sourceFile), 'utf8'),
  sensor09.sourceFile,
).records.filter(
  (record) => record.timestamp >= sensor09.startTimestamp && record.timestamp <= sensor09.endTimestamp,
);
const sensor09StartMs = sensor09Records[0].arithmeticTimeMs;
const at0800 = sensor09StartMs + 30 * 60 * 1000;
const at0830 = sensor09StartMs + 60 * 60 * 1000;
sensor09.periodReview = {
  before0800: summarizePeriod(sensor09Records, sensor09StartMs, at0800),
  from0800To0830: summarizePeriod(sensor09Records, at0800, at0830),
  after0830: summarizePeriod(sensor09Records, at0830, sensor09Records.at(-1).arithmeticTimeMs, true),
};

console.log(JSON.stringify({
  method: {
    binSeconds: BIN_SECONDS,
    movementThresholdC: MOVEMENT_THRESHOLD_C,
    baselineSeconds: BASELINE_SECONDS,
    demoUpperThresholdC,
    demoThresholdAffectsCandidateRanking: false,
  },
  reviews,
}, null, 2));
