'use strict';

const EXPECTED_HEADER = ['Date', 'Time', 'Temperature (C)', 'Humidity (%)'];
const DEFAULT_POLICY = Object.freeze({
  expectedIntervalSeconds: 5,
  candidateDurationsMinutes: Object.freeze([60, 90, 120, 180]),
  candidateStartStepMinutes: 15,
  baselineMinutes: 15,
  variationBinMinutes: 5,
  baselineRangeThresholdC: 0.5,
  postVariationMeanShiftThresholdC: 0.25,
  shortlistSize: 5,
});

const REQUIRED_BLUEPRINT_PATHS = Object.freeze([
  'blueprint_id',
  'blueprint_version',
  'status',
  'observed_evidence.time_series',
  'observed_evidence.spatial',
  'synthetic_context.segments',
  'evidence_selection_criteria',
  'evidence_selection_criteria.zenodo.required',
  'evidence_selection_criteria.zenodo.preferred',
  'evidence_selection_criteria.zenodo.not_required',
  'evidence_selection_criteria.mendeley',
  'replay_policy',
  'replay_policy.preferred_mode',
  'mapping_rules',
  'mapping_rules.zenodo_to_segment',
  'mapping_rules.mendeley_to_scenario',
  'assumptions.product_profile',
]);

function getPath(value, dottedPath) {
  return dottedPath.split('.').reduce((current, key) => current?.[key], value);
}

function isPresent(value) {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && typeof value === 'object';
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function loadBlueprint(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('Scenario blueprint is empty.');
  }

  let blueprint;
  try {
    blueprint = JSON.parse(text);
  } catch (error) {
    throw new Error(`Scenario blueprint contains invalid JSON: ${error.message}`);
  }

  const missingPaths = REQUIRED_BLUEPRINT_PATHS.filter(
    (requiredPath) => !isPresent(getPath(blueprint, requiredPath)),
  );
  if (missingPaths.length > 0) {
    throw new Error(`Scenario blueprint is missing required design fields: ${missingPaths.join(', ')}`);
  }

  const stringPaths = ['blueprint_id', 'blueprint_version', 'status'];
  const objectPaths = [
    'observed_evidence.time_series',
    'observed_evidence.spatial',
    'evidence_selection_criteria',
    'evidence_selection_criteria.mendeley',
    'replay_policy',
    'mapping_rules',
    'mapping_rules.zenodo_to_segment',
    'mapping_rules.mendeley_to_scenario',
    'assumptions.product_profile',
  ];
  const arrayPaths = [
    'synthetic_context.segments',
    'evidence_selection_criteria.zenodo.required',
    'evidence_selection_criteria.zenodo.preferred',
    'evidence_selection_criteria.zenodo.not_required',
  ];
  const invalidTypePaths = [
    ...stringPaths.filter((requiredPath) => typeof getPath(blueprint, requiredPath) !== 'string'),
    ...objectPaths.filter((requiredPath) => !isObject(getPath(blueprint, requiredPath))),
    ...arrayPaths.filter((requiredPath) => !Array.isArray(getPath(blueprint, requiredPath))),
  ];
  if (invalidTypePaths.length > 0) {
    throw new Error(
      `Scenario blueprint has invalid required design field types: ${invalidTypePaths.join(', ')}`,
    );
  }
  const criteriaArrays = [
    blueprint.evidence_selection_criteria.zenodo.required,
    blueprint.evidence_selection_criteria.zenodo.preferred,
    blueprint.evidence_selection_criteria.zenodo.not_required,
  ];
  if (criteriaArrays.some((criteria) => criteria.some((criterion) => typeof criterion !== 'string'))) {
    throw new Error('Scenario blueprint evidence-selection criteria must be strings.');
  }

  const timeSeries = blueprint.observed_evidence.time_series;
  const spatial = blueprint.observed_evidence.spatial;
  const productProfile = blueprint.assumptions.product_profile;
  const zenodoCriteria = blueprint.evidence_selection_criteria.zenodo;
  if (!isPresent(timeSeries.source_dataset) || !isPresent(timeSeries.role)) {
    throw new Error('Scenario blueprint time-series evidence must declare source_dataset and role.');
  }
  if (!isPresent(spatial.role)) {
    throw new Error('Scenario blueprint spatial evidence must declare its role.');
  }
  if (!isPresent(productProfile.profile_id)) {
    throw new Error('Scenario blueprint product profile must declare profile_id.');
  }
  if (typeof productProfile.does_not_describe_source_dataset !== 'boolean') {
    throw new Error(
      'Scenario blueprint product profile must declare does_not_describe_source_dataset.',
    );
  }
  if (
    blueprint.mapping_rules.zenodo_to_segment.rewrite_source_timestamp !== false ||
    blueprint.mapping_rules.zenodo_to_segment.rewrite_measurement_value !== false
  ) {
    throw new Error(
      'Scenario blueprint must prohibit rewriting Zenodo timestamps and measurement values.',
    );
  }
  if (blueprint.mapping_rules.mendeley_to_scenario.used_for_excursion_calculation !== false) {
    throw new Error(
      'Scenario blueprint must prohibit using Mendeley evidence for excursion calculation.',
    );
  }
  if (
    !zenodoCriteria.not_required.some((criterion) =>
      criterion.includes(productProfile.profile_id),
    )
  ) {
    throw new Error(
      `Scenario blueprint must state the ${productProfile.profile_id} evidence-selection restriction.`,
    );
  }

  return blueprint;
}

function getBlueprintMetadata(blueprint) {
  return {
    blueprintId: blueprint.blueprint_id,
    blueprintVersion: blueprint.blueprint_version,
    blueprintStatus: blueprint.status,
    preferredReplayMode: blueprint.replay_policy.preferred_mode,
    syntheticSegmentCount: blueprint.synthetic_context.segments.length,
    zenodoRequiredCriteria: [...blueprint.evidence_selection_criteria.zenodo.required],
    zenodoPreferredCriteria: [...blueprint.evidence_selection_criteria.zenodo.preferred],
    mendeleyRole: blueprint.observed_evidence.spatial.role,
    zenodoRewriteSourceTimestamp:
      blueprint.mapping_rules.zenodo_to_segment.rewrite_source_timestamp,
    zenodoRewriteMeasurementValue:
      blueprint.mapping_rules.zenodo_to_segment.rewrite_measurement_value,
    mendeleyUsedForExcursionCalculation:
      blueprint.mapping_rules.mendeley_to_scenario.used_for_excursion_calculation,
    productProfileId: blueprint.assumptions.product_profile.profile_id,
    productProfileExcludedFromSelection:
      blueprint.assumptions.product_profile.does_not_describe_source_dataset &&
      blueprint.evidence_selection_criteria.zenodo.not_required.some((criterion) =>
        criterion.includes(blueprint.assumptions.product_profile.profile_id),
      ),
  };
}

function parseSourceDateTime(dateRaw, timeRaw) {
  const dottedDateMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dateRaw);
  const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateRaw);
  const timeMatch = /^(\d{2}):(\d{2}):(\d{2})$/.exec(timeRaw);

  if ((!dottedDateMatch && !isoDateMatch) || !timeMatch) return null;

  const [, dayText, monthText, yearText] = dottedDateMatch ?? [
    isoDateMatch[0],
    isoDateMatch[3],
    isoDateMatch[2],
    isoDateMatch[1],
  ];
  const [, hourText, minuteText, secondText] = timeMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (
    month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59
  ) {
    return null;
  }

  // Date.UTC is used only as a timezone-neutral arithmetic index for source-local
  // calendar components. The returned source timestamp deliberately has no offset.
  const arithmeticTimeMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(arithmeticTimeMs);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    return null;
  }

  return {
    timestamp: `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}`,
    arithmeticTimeMs,
  };
}

function parseZenodoCsv(text, fileName) {
  const sensorMatch = /^(SENSOR\d{2})\.CSV$/i.exec(fileName);
  if (!sensorMatch) throw new Error(`Unsupported Zenodo filename: ${fileName}`);

  const sensorId = sensorMatch[1].toUpperCase();
  const records = [];
  const malformedRows = [];
  let structuralHeaderCount = 0;
  let blankLineCount = 0;
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const physicalRow = index + 1;
    const line = lines[index];
    if (line.trim() === '') {
      blankLineCount += 1;
      continue;
    }

    const columns = line.split(';').map((value) => value.trim());
    if (
      columns.length === EXPECTED_HEADER.length &&
      columns.every((value, columnIndex) => value === EXPECTED_HEADER[columnIndex])
    ) {
      structuralHeaderCount += 1;
      continue;
    }

    if (columns.length !== 4) {
      malformedRows.push({ rawRef: `row:${physicalRow}`, code: 'WRONG_COLUMN_COUNT' });
      continue;
    }

    const parsedTimestamp = parseSourceDateTime(columns[0], columns[1]);
    const temperatureC = Number(columns[2]);
    const humidityPct = Number(columns[3]);
    if (
      !parsedTimestamp ||
      columns[2] === '' ||
      !Number.isFinite(temperatureC) ||
      columns[3] === '' ||
      !Number.isFinite(humidityPct)
    ) {
      malformedRows.push({ rawRef: `row:${physicalRow}`, code: 'INVALID_MEASUREMENT_ROW' });
      continue;
    }

    records.push({
      sensorId,
      fileName,
      rawRef: `row:${physicalRow}`,
      timestamp: parsedTimestamp.timestamp,
      arithmeticTimeMs: parsedTimestamp.arithmeticTimeMs,
      temperatureC,
      humidityPct,
    });
  }

  return { sensorId, fileName, records, malformedRows, structuralHeaderCount, blankLineCount };
}

function parseExperimentActions(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const events = [];

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '') continue;
    const [dateRaw, action, startRaw, endRaw] = lines[index].split(';').map((value) => value.trim());
    const start = parseSourceDateTime(dateRaw, startRaw);
    const end = parseSourceDateTime(dateRaw, endRaw);
    if (!start || !end || !action) {
      throw new Error(`Invalid experiment action at physical row ${index + 1}.`);
    }
    events.push({
      action,
      startTimestamp: start.timestamp,
      endTimestamp: end.timestamp,
      startTimeMs: start.arithmeticTimeMs,
      endTimeMs: end.arithmeticTimeMs,
      sourceRef: `experiment_actions.csv:row:${index + 1}`,
    });
  }

  return events;
}

function evaluateContinuity(records, expectedIntervalSeconds = 5) {
  if (!Number.isFinite(expectedIntervalSeconds) || expectedIntervalSeconds <= 0) {
    throw new Error('expectedIntervalSeconds must be a positive finite number.');
  }

  const intervalMs = expectedIntervalSeconds * 1000;
  let internalMissingIntervalCount = 0;
  let expectedMissingSampleCount = 0;
  let duplicateTimestampCount = 0;
  let outOfOrderCount = 0;
  const gaps = [];

  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1];
    const next = records[index];
    const deltaMs = next.arithmeticTimeMs - previous.arithmeticTimeMs;

    if (deltaMs === 0) {
      duplicateTimestampCount += 1;
    } else if (deltaMs < 0) {
      outOfOrderCount += 1;
    } else if (deltaMs > intervalMs) {
      const missingCount = Math.max(0, Math.ceil(deltaMs / intervalMs) - 1);
      internalMissingIntervalCount += 1;
      expectedMissingSampleCount += missingCount;
      gaps.push({ previous, next, observedGapSeconds: deltaMs / 1000, missingCount });
    }
  }

  return {
    internalMissingIntervalCount,
    expectedMissingSampleCount,
    duplicateTimestampCount,
    outOfOrderCount,
    gaps,
  };
}

function splitContinuousRuns(records, expectedIntervalSeconds = 5) {
  if (records.length === 0) return [];
  const intervalMs = expectedIntervalSeconds * 1000;
  const runs = [];
  let start = 0;

  for (let index = 1; index < records.length; index += 1) {
    if (records[index].arithmeticTimeMs - records[index - 1].arithmeticTimeMs !== intervalMs) {
      runs.push(records.slice(start, index));
      start = index;
    }
  }
  runs.push(records.slice(start));
  return runs;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, precision = 6) {
  const scale = 10 ** precision;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function summarizeValues(records, field) {
  const values = records.map((record) => record[field]);
  return {
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    mean: round(mean(values)),
    range: round(Math.max(...values) - Math.min(...values)),
  };
}

function overlappingEvents(events, startTimeMs, endTimeMs) {
  return events.filter(
    (event) => event.startTimeMs <= endTimeMs && event.endTimeMs >= startTimeMs,
  );
}

function compactEventRefs(events) {
  if (events.length === 0) return '';
  const rowNumbers = events
    .map((event) => Number(event.sourceRef.split(':').at(-1)))
    .sort((left, right) => left - right);
  const ranges = [];
  let start = rowNumbers[0];
  let end = rowNumbers[0];

  for (let index = 1; index < rowNumbers.length; index += 1) {
    if (rowNumbers[index] === end + 1) {
      end = rowNumbers[index];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = rowNumbers[index];
      end = rowNumbers[index];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return `experiment_actions.csv:${events.length === 1 ? 'row' : 'rows'}:${ranges.join('|')}`;
}

function computeVariation(records, policy = DEFAULT_POLICY) {
  const samplesPerBin = (policy.variationBinMinutes * 60) / policy.expectedIntervalSeconds;
  const baselineSamples = (policy.baselineMinutes * 60) / policy.expectedIntervalSeconds;
  const completeBinCount = Math.floor((records.length - 1) / samplesPerBin);
  const binMeans = [];

  for (let bin = 0; bin < completeBinCount; bin += 1) {
    const start = bin * samplesPerBin;
    const temperatures = records
      .slice(start, start + samplesPerBin)
      .map((record) => record.temperatureC);
    binMeans.push(mean(temperatures));
  }

  let maxFiveMinuteMeanDeltaC = 0;
  let maxDeltaBin = -1;
  for (let index = 1; index < binMeans.length; index += 1) {
    const delta = Math.abs(binMeans[index] - binMeans[index - 1]);
    if (delta > maxFiveMinuteMeanDeltaC) {
      maxFiveMinuteMeanDeltaC = delta;
      maxDeltaBin = index;
    }
  }

  const firstTemperatures = records.slice(0, baselineSamples).map((record) => record.temperatureC);
  const lastTemperatures = records.slice(-baselineSamples).map((record) => record.temperatureC);
  const firstRange = Math.max(...firstTemperatures) - Math.min(...firstTemperatures);
  const firstMean = mean(firstTemperatures);
  const lastMean = mean(lastTemperatures);
  const hasPreVariationBaseline = firstRange <= policy.baselineRangeThresholdC;
  const binsAfterVariation = maxDeltaBin < 0 ? 0 : binMeans.length - maxDeltaBin - 1;
  const requiredPostBins = policy.baselineMinutes / policy.variationBinMinutes;
  const hasPostVariationBehavior =
    binsAfterVariation >= requiredPostBins &&
    Math.abs(lastMean - firstMean) >= policy.postVariationMeanShiftThresholdC;

  const temperature = summarizeValues(records, 'temperatureC');
  return {
    maxFiveMinuteMeanDeltaC: round(maxFiveMinuteMeanDeltaC),
    thermalVariationScore: round(temperature.range + maxFiveMinuteMeanDeltaC),
    hasPreVariationBaseline,
    hasPostVariationBehavior,
  };
}

function createCandidate(records, events, policy = DEFAULT_POLICY) {
  const first = records[0];
  const last = records[records.length - 1];
  const durationSeconds = (last.arithmeticTimeMs - first.arithmeticTimeMs) / 1000;
  const temperature = summarizeValues(records, 'temperatureC');
  const humidity = summarizeValues(records, 'humidityPct');
  const continuity = evaluateContinuity(records, policy.expectedIntervalSeconds);
  const variation = computeVariation(records, policy);
  const eventMatches = overlappingEvents(events, first.arithmeticTimeMs, last.arithmeticTimeMs);
  const score = round(
    variation.thermalVariationScore +
      Math.min(eventMatches.length, 4) * 0.25,
  );
  const timestampToken = first.timestamp.replace(/[-:]/g, '');

  return {
    candidateId: `ZEN-${first.sensorId.slice(-2)}-${timestampToken}-${durationSeconds / 60}M`,
    sensorId: first.sensorId,
    sourceFile: first.fileName,
    startTimestamp: first.timestamp,
    endTimestamp: last.timestamp,
    durationSeconds,
    observationCount: records.length,
    minTemperatureC: temperature.min,
    maxTemperatureC: temperature.max,
    meanTemperatureC: temperature.mean,
    temperatureRangeC: temperature.range,
    minHumidityPct: humidity.min,
    maxHumidityPct: humidity.max,
    meanHumidityPct: humidity.mean,
    expectedIntervalSeconds: policy.expectedIntervalSeconds,
    internalMissingIntervalCount: continuity.internalMissingIntervalCount,
    expectedMissingSampleCount: continuity.expectedMissingSampleCount,
    duplicateTimestampCount: continuity.duplicateTimestampCount,
    outOfOrderCount: continuity.outOfOrderCount,
    thermalVariationScore: variation.thermalVariationScore,
    documentedEventCount: eventMatches.length,
    documentedEventTypes: [...new Set(eventMatches.map((event) => event.action))].join('|'),
    documentedEventRefs: compactEventRefs(eventMatches),
    hasPreVariationBaseline: variation.hasPreVariationBaseline,
    hasPostVariationBehavior: variation.hasPostVariationBehavior,
    sourceContinuityStatus:
      continuity.internalMissingIntervalCount > 0
        ? 'SOURCE_MISSING_INTERVAL'
        : continuity.duplicateTimestampCount > 0
          ? 'SOURCE_DUPLICATE_TIMESTAMP'
          : continuity.outOfOrderCount > 0
            ? 'SOURCE_OUT_OF_ORDER_TIMESTAMP'
            : 'CONTINUOUS',
    observedValuesOnly: true,
    selectionScore: score,
  };
}

function generateCandidates(records, events, policy = DEFAULT_POLICY) {
  const candidates = [];
  const runs = splitContinuousRuns(records, policy.expectedIntervalSeconds);
  const stepMinutes = policy.candidateStartStepMinutes;

  for (const run of runs) {
    for (let startIndex = 0; startIndex < run.length; startIndex += 1) {
      const start = run[startIndex];
      const time = new Date(start.arithmeticTimeMs);
      if (
        time.getUTCSeconds() !== 0 ||
        time.getUTCMinutes() % stepMinutes !== 0
      ) {
        continue;
      }

      for (const durationMinutes of policy.candidateDurationsMinutes) {
        const sampleCount = (durationMinutes * 60) / policy.expectedIntervalSeconds + 1;
        const endIndex = startIndex + sampleCount - 1;
        if (endIndex >= run.length) continue;
        const expectedEnd = start.arithmeticTimeMs + durationMinutes * 60 * 1000;
        if (run[endIndex].arithmeticTimeMs !== expectedEnd) continue;
        candidates.push(createCandidate(run.slice(startIndex, endIndex + 1), events, policy));
      }
    }
  }

  return candidates;
}

function compareCandidates(left, right) {
  return (
    right.selectionScore - left.selectionScore ||
    left.sensorId.localeCompare(right.sensorId) ||
    left.startTimestamp.localeCompare(right.startTimestamp) ||
    right.durationSeconds - left.durationSeconds
  );
}

function normalizeCriterion(criterion) {
  return criterion.trim().toLowerCase().replace(/\s+/g, ' ');
}

function requiredCriterionSatisfied(criterion, candidate, blueprint, context) {
  const normalized = normalizeCriterion(criterion);
  const segmentCount = blueprint.synthetic_context.segments.length;
  const checks = {
    'raw provenance available': () => context.provenanceFiles.has(candidate.sourceFile),
    'continuous timestamps within selected replay interval': () =>
      candidate.sourceContinuityStatus === 'CONTINUOUS' &&
      candidate.internalMissingIntervalCount === 0 &&
      candidate.duplicateTimestampCount === 0 &&
      candidate.outOfOrderCount === 0,
    'sufficient duration to divide into four synthetic segments': () =>
      segmentCount === 4 &&
      candidate.durationSeconds > 0 &&
      candidate.durationSeconds % segmentCount === 0,
    'no fabricated temperature values': () => candidate.observedValuesOnly === true,
    'no unresolved malformed source rows': () =>
      (context.malformedRowsByFile.get(candidate.sourceFile) ?? Number.POSITIVE_INFINITY) === 0,
  };
  return checks[normalized]?.() ?? false;
}

function preferredCriterionSatisfied(criterion, candidate) {
  const normalized = normalizeCriterion(criterion);
  const checks = {
    'single source sensor': () => typeof candidate.sensorId === 'string' && candidate.sensorId !== '',
    'regular five-second sampling': () =>
      candidate.expectedIntervalSeconds === 5 &&
      candidate.duplicateTimestampCount === 0 &&
      candidate.outOfOrderCount === 0,
    'no internal missing interval': () => candidate.internalMissingIntervalCount === 0,
    'meaningful thermal variation': () => candidate.thermalVariationScore > 0,
    'documented experiment event available': () => candidate.documentedEventCount > 0,
    'stable period before thermal variation': () => candidate.hasPreVariationBaseline === true,
    'post-event behavior visible if supported by source': () =>
      candidate.hasPostVariationBehavior === true,
  };
  return checks[normalized]?.() ?? false;
}

function evaluateCandidateAgainstBlueprint(candidate, blueprint, context) {
  const requiredCriteria = blueprint.evidence_selection_criteria.zenodo.required;
  const preferredCriteria = blueprint.evidence_selection_criteria.zenodo.preferred;
  const failedRequired = requiredCriteria.filter(
    (criterion) => !requiredCriterionSatisfied(criterion, candidate, blueprint, context),
  );
  const matchedPreferred = preferredCriteria.filter((criterion) =>
    preferredCriterionSatisfied(criterion, candidate),
  );
  const unmatchedPreferred = preferredCriteria.filter(
    (criterion) => !matchedPreferred.includes(criterion),
  );
  const eligible = failedRequired.length === 0;
  const blueprintFitScore = matchedPreferred.length;
  const blueprintFitStatus = !eligible
    ? 'INELIGIBLE'
    : blueprintFitScore === preferredCriteria.length
      ? 'FULL_PREFERRED_FIT'
      : blueprintFitScore > 0
        ? 'PARTIAL_PREFERRED_FIT'
        : 'ELIGIBLE_NO_PREFERRED_FIT';

  return {
    ...candidate,
    eligibilityStatus: eligible ? 'ELIGIBLE' : 'INELIGIBLE',
    eligibilityReasons:
      failedRequired.length === 0
        ? 'All required Zenodo evidence criteria satisfied.'
        : `Failed required criteria: ${failedRequired.join('|')}`,
    blueprintFitStatus,
    blueprintFitScore,
    blueprintFitReasons: `matched: ${matchedPreferred.join('|') || 'none'}; unmet: ${
      unmatchedPreferred.join('|') || 'none'
    }`,
  };
}

function compareBlueprintCandidates(left, right) {
  return (
    Number(right.eligibilityStatus === 'ELIGIBLE') -
      Number(left.eligibilityStatus === 'ELIGIBLE') ||
    right.blueprintFitScore - left.blueprintFitScore ||
    compareCandidates(left, right)
  );
}

function selectSensorWinners(
  candidates,
  blueprint,
  context,
  shortlistSize = DEFAULT_POLICY.shortlistSize,
) {
  const evaluatedCandidates = candidates.map((candidate) =>
    evaluateCandidateAgainstBlueprint(candidate, blueprint, context),
  );
  const bestBySensor = new Map();
  for (const candidate of [...evaluatedCandidates].sort(compareBlueprintCandidates)) {
    if (!bestBySensor.has(candidate.sensorId)) bestBySensor.set(candidate.sensorId, candidate);
  }

  const metadata = getBlueprintMetadata(blueprint);
  return [...bestBySensor.values()]
    .sort(compareBlueprintCandidates)
    .map((candidate, index) => {
      const shortlisted = candidate.eligibilityStatus === 'ELIGIBLE' && index < shortlistSize;
      return {
        ...candidate,
        rank: index + 1,
        selectionStatus: shortlisted ? 'SHORTLISTED' : 'REJECTED',
        selectionRationale: shortlisted
          ? `Eligible under ${metadata.blueprintId} v${metadata.blueprintVersion}; ${candidate.blueprintFitScore}/${metadata.zenodoPreferredCriteria.length} preferred criteria matched. Blueprint loaded successfully; final candidate requires manual scientific review.`
          : '',
        rejectionReason: shortlisted
          ? ''
          : candidate.eligibilityStatus === 'INELIGIBLE'
            ? candidate.eligibilityReasons
            : 'Eligible but ranked below the shortlist after blueprint fit and deterministic thermal/event tie-breaker.',
      };
    });
}

function createGapAuditCandidates(parsedSources, events, policy = DEFAULT_POLICY) {
  const candidates = [];

  for (const source of parsedSources) {
    const continuity = evaluateContinuity(source.records, policy.expectedIntervalSeconds);
    continuity.gaps.forEach((gap, gapIndex) => {
      const marginMs = 30 * 60 * 1000;
      const startMs = Math.max(source.records[0].arithmeticTimeMs, gap.previous.arithmeticTimeMs - marginMs);
      const endMs = Math.min(
        source.records[source.records.length - 1].arithmeticTimeMs,
        gap.next.arithmeticTimeMs + marginMs,
      );
      const records = source.records.filter(
        (record) => record.arithmeticTimeMs >= startMs && record.arithmeticTimeMs <= endMs,
      );
      const audit = createCandidate(records, events, policy);
      candidates.push({
        ...audit,
        candidateId: `ZEN-GAP-${source.sensorId.slice(-2)}-${String(gapIndex + 1).padStart(2, '0')}`,
        rank: '',
        selectionStatus: 'REJECTED',
        selectionRationale: '',
        rejectionReason: `Contains a source gap of ${gap.observedGapSeconds} seconds with ${gap.missingCount} expected samples absent.`,
      });
    });
  }

  return candidates;
}

const CANDIDATE_COLUMNS = Object.freeze([
  'candidate_id',
  'rank',
  'sensor_id',
  'source_file',
  'start_timestamp',
  'end_timestamp',
  'duration_seconds',
  'observation_count',
  'min_temperature_c',
  'max_temperature_c',
  'mean_temperature_c',
  'temperature_range_c',
  'min_humidity_pct',
  'max_humidity_pct',
  'mean_humidity_pct',
  'expected_interval_seconds',
  'internal_missing_interval_count',
  'expected_missing_sample_count',
  'duplicate_timestamp_count',
  'out_of_order_count',
  'thermal_variation_score',
  'documented_event_count',
  'documented_event_types',
  'documented_event_refs',
  'has_pre_variation_baseline',
  'has_post_variation_behavior',
  'source_continuity_status',
  'eligibility_status',
  'eligibility_reasons',
  'blueprint_fit_status',
  'blueprint_fit_score',
  'blueprint_fit_reasons',
  'selection_status',
  'selection_score',
  'selection_rationale',
  'rejection_reason',
]);

function toSnakeCaseRecord(candidate) {
  return {
    candidate_id: candidate.candidateId,
    rank: candidate.rank,
    sensor_id: candidate.sensorId,
    source_file: candidate.sourceFile,
    start_timestamp: candidate.startTimestamp,
    end_timestamp: candidate.endTimestamp,
    duration_seconds: candidate.durationSeconds,
    observation_count: candidate.observationCount,
    min_temperature_c: candidate.minTemperatureC,
    max_temperature_c: candidate.maxTemperatureC,
    mean_temperature_c: candidate.meanTemperatureC,
    temperature_range_c: candidate.temperatureRangeC,
    min_humidity_pct: candidate.minHumidityPct,
    max_humidity_pct: candidate.maxHumidityPct,
    mean_humidity_pct: candidate.meanHumidityPct,
    expected_interval_seconds: candidate.expectedIntervalSeconds,
    internal_missing_interval_count: candidate.internalMissingIntervalCount,
    expected_missing_sample_count: candidate.expectedMissingSampleCount,
    duplicate_timestamp_count: candidate.duplicateTimestampCount,
    out_of_order_count: candidate.outOfOrderCount,
    thermal_variation_score: candidate.thermalVariationScore,
    documented_event_count: candidate.documentedEventCount,
    documented_event_types: candidate.documentedEventTypes,
    documented_event_refs: candidate.documentedEventRefs,
    has_pre_variation_baseline: candidate.hasPreVariationBaseline,
    has_post_variation_behavior: candidate.hasPostVariationBehavior,
    source_continuity_status: candidate.sourceContinuityStatus,
    eligibility_status: candidate.eligibilityStatus,
    eligibility_reasons: candidate.eligibilityReasons,
    blueprint_fit_status: candidate.blueprintFitStatus,
    blueprint_fit_score: candidate.blueprintFitScore,
    blueprint_fit_reasons: candidate.blueprintFitReasons,
    selection_status: candidate.selectionStatus,
    selection_score: candidate.selectionScore,
    selection_rationale: candidate.selectionRationale,
    rejection_reason: candidate.rejectionReason,
  };
}

function escapeCsv(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function serializeCandidates(candidates) {
  const rows = candidates.map((candidate) => {
    const record = toSnakeCaseRecord(candidate);
    return CANDIDATE_COLUMNS.map((column) => escapeCsv(record[column])).join(',');
  });
  return `${CANDIDATE_COLUMNS.join(',')}\n${rows.join('\n')}\n`;
}

module.exports = {
  CANDIDATE_COLUMNS,
  DEFAULT_POLICY,
  compareCandidates,
  compareBlueprintCandidates,
  createGapAuditCandidates,
  evaluateCandidateAgainstBlueprint,
  evaluateContinuity,
  generateCandidates,
  getBlueprintMetadata,
  loadBlueprint,
  parseExperimentActions,
  parseSourceDateTime,
  parseZenodoCsv,
  selectSensorWinners,
  serializeCandidates,
  splitContinuousRuns,
};
