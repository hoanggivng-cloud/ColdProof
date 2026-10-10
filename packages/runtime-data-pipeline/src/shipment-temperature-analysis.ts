import { createHash } from 'node:crypto';

import {
  CanonicalTimeSeriesMeasurementSchema,
  type CanonicalTimeSeriesMeasurement,
} from '@coldproof/canonical-schema';
import type {
  RuntimeDataQualityFinding,
  RuntimeDataQualityResult,
  RuntimeDeviceIdentity,
} from '@coldproof/runtime-data-quality';

export const SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_ID =
  'shipment-temperature-analysis-v1';
export const SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_VERSION = '1.0.0';

export type TemperatureThresholdOrigin =
  | 'SHIPMENT_CONFIGURATION'
  | 'SYNTHETIC_DEMO_CONTEXT';

export interface TemperatureThreshold {
  min_temperature_c: number;
  max_temperature_c: number;
  unit: 'CELSIUS';
  threshold_origin: TemperatureThresholdOrigin;
  threshold_reference_id?: string;
  policy_id: string;
  policy_version: string;
}

export interface TemperatureAnalysisInput {
  measurements: readonly CanonicalTimeSeriesMeasurement[];
  threshold: TemperatureThreshold;
  data_quality_result?: RuntimeDataQualityResult;
  shipment_reference?: string;
}

export type TemperatureAnalysisStatus =
  | 'NOT_ASSESSED'
  | 'IN_RANGE'
  | 'EXCURSION_DETECTED';

export type TemperatureExcursionDirection =
  | 'ABOVE_MAXIMUM'
  | 'BELOW_MINIMUM';

export type TemperatureExcursionTerminationReason =
  | 'RETURNED_IN_RANGE'
  | 'DIRECTION_CHANGED'
  | 'DATA_GAP'
  | 'SEQUENCE_END';

export type TemperatureAnalysisReliability =
  | 'NOT_ASSESSED'
  | 'UNAFFECTED_BY_REPORTED_DQ_FINDINGS'
  | 'AFFECTED_BY_DATA_QUALITY_FINDINGS';

export interface AppliedTemperatureAnalysisPolicy {
  policy_id: typeof SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_ID;
  policy_version: typeof SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_VERSION;
  threshold_boundary_semantics: 'INCLUSIVE';
  episode_interval_semantics: '[start,end)';
  duration_semantics: 'SAMPLING_RESOLUTION_WINDOW';
}

export interface TemperatureAnalysisDataQualityContext {
  assessment_status: 'NOT_ASSESSED' | 'PASS' | 'FLAGGED';
  reliability: TemperatureAnalysisReliability;
  policy_id?: string;
  finding_ids: string[];
  finding_codes: string[];
}

export interface TemperatureExcursionEpisode {
  excursion_id: string;
  device: RuntimeDeviceIdentity;
  direction: TemperatureExcursionDirection;
  start_at: string;
  end_at: string | null;
  open_ended: boolean;
  first_record_id: string;
  last_out_of_range_record_id: string;
  last_out_of_range_at: string;
  contributing_record_ids: string[];
  out_of_range_sample_count: number;
  extreme_temperature_c: number;
  threshold_temperature_c: number;
  observed_span_ms: number;
  episode_window_duration_ms: number | null;
  termination_reason: TemperatureExcursionTerminationReason;
  continuity_uncertain: boolean;
  data_quality_finding_ids: string[];
  policy_id: typeof SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_ID;
  policy_version: typeof SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_VERSION;
}

export interface TemperatureStreamResult {
  device: RuntimeDeviceIdentity;
  temperature_status: Exclude<TemperatureAnalysisStatus, 'NOT_ASSESSED'>;
  measurement_count: number;
  excursion_count: number;
  excursion_ids: string[];
  minimum_observed_temperature_c: number;
  maximum_observed_temperature_c: number;
  first_observed_at: string;
  last_observed_at: string;
}

export interface TemperatureAnalysisSummary {
  measurement_count: number;
  stream_count: number;
  streams_in_range: number;
  streams_with_excursion: number;
  excursion_count: number;
  above_excursion_count: number;
  below_excursion_count: number;
  minimum_observed_temperature_c?: number;
  maximum_observed_temperature_c?: number;
  first_observed_at?: string;
  last_observed_at?: string;
}

export interface TemperatureAnalysisError {
  code: 'INVALID_THRESHOLD_CONFIGURATION' | 'INVALID_CANONICAL_MEASUREMENT';
  field: string;
  message: string;
}

interface ResultBase {
  policy: AppliedTemperatureAnalysisPolicy;
  data_quality_context: TemperatureAnalysisDataQualityContext;
  summary: TemperatureAnalysisSummary;
  shipment_reference?: string;
}

export type ShipmentTemperatureAnalysisResult =
  | (ResultBase & {
      success: false;
      temperature_status: 'NOT_ASSESSED';
      errors: TemperatureAnalysisError[];
      threshold?: never;
      episodes: [];
      streams: [];
    })
  | (ResultBase & {
      success: true;
      temperature_status: 'NOT_ASSESSED';
      threshold: TemperatureThreshold;
      reason: {
        code: 'NO_CANONICAL_MEASUREMENTS';
        message: string;
      };
      episodes: [];
      streams: [];
    })
  | (ResultBase & {
      success: true;
      temperature_status: 'IN_RANGE' | 'EXCURSION_DETECTED';
      threshold: TemperatureThreshold;
      episodes: TemperatureExcursionEpisode[];
      streams: TemperatureStreamResult[];
    });

type IndexedMeasurement = {
  measurement: CanonicalTimeSeriesMeasurement;
  epochMilliseconds: number;
  inputIndex: number;
};

type ActiveEpisode = {
  direction: TemperatureExcursionDirection;
  records: IndexedMeasurement[];
};

const APPLIED_POLICY: AppliedTemperatureAnalysisPolicy = {
  policy_id: SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_ID,
  policy_version: SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_VERSION,
  threshold_boundary_semantics: 'INCLUSIVE',
  episode_interval_semantics: '[start,end)',
  duration_semantics: 'SAMPLING_RESOLUTION_WINDOW',
};

function deviceIdentity(
  measurement: CanonicalTimeSeriesMeasurement,
): RuntimeDeviceIdentity {
  return {
    source_dataset: measurement.source_dataset,
    source_format: measurement.source_format,
    source_sensor_id: measurement.source_sensor_id,
  };
}

function deviceKey(device: RuntimeDeviceIdentity): string {
  return JSON.stringify([
    device.source_dataset,
    device.source_format,
    device.source_sensor_id,
  ]);
}

function emptySummary(measurementCount = 0): TemperatureAnalysisSummary {
  return {
    measurement_count: measurementCount,
    stream_count: 0,
    streams_in_range: 0,
    streams_with_excursion: 0,
    excursion_count: 0,
    above_excursion_count: 0,
    below_excursion_count: 0,
  };
}

function dataQualityContext(
  result: RuntimeDataQualityResult | undefined,
): TemperatureAnalysisDataQualityContext {
  if (result === undefined || !result.success) {
    return {
      assessment_status: 'NOT_ASSESSED',
      reliability: 'NOT_ASSESSED',
      ...(result !== undefined ? { policy_id: result.policy_id } : {}),
      finding_ids: [],
      finding_codes: [],
    };
  }
  return {
    assessment_status: result.assessment_status,
    reliability: result.assessment_status === 'FLAGGED'
      ? 'AFFECTED_BY_DATA_QUALITY_FINDINGS'
      : 'UNAFFECTED_BY_REPORTED_DQ_FINDINGS',
    policy_id: result.policy.policy_id,
    finding_ids: result.findings.map((finding) => finding.finding_id),
    finding_codes: [...new Set(result.findings.map((finding) => finding.code))],
  };
}

function thresholdErrors(threshold: TemperatureThreshold): TemperatureAnalysisError[] {
  const errors: TemperatureAnalysisError[] = [];
  if (!Number.isFinite(threshold.min_temperature_c)) {
    errors.push({
      code: 'INVALID_THRESHOLD_CONFIGURATION',
      field: 'threshold.min_temperature_c',
      message: 'min_temperature_c must be finite',
    });
  }
  if (!Number.isFinite(threshold.max_temperature_c)) {
    errors.push({
      code: 'INVALID_THRESHOLD_CONFIGURATION',
      field: 'threshold.max_temperature_c',
      message: 'max_temperature_c must be finite',
    });
  }
  if (
    Number.isFinite(threshold.min_temperature_c) &&
    Number.isFinite(threshold.max_temperature_c) &&
    threshold.min_temperature_c >= threshold.max_temperature_c
  ) {
    errors.push({
      code: 'INVALID_THRESHOLD_CONFIGURATION',
      field: 'threshold.min_temperature_c',
      message: 'min_temperature_c must be strictly less than max_temperature_c',
    });
  }
  if (threshold.unit !== 'CELSIUS') {
    errors.push({
      code: 'INVALID_THRESHOLD_CONFIGURATION',
      field: 'threshold.unit',
      message: 'Temperature analysis v1 requires canonical Celsius values',
    });
  }
  if (!['SHIPMENT_CONFIGURATION', 'SYNTHETIC_DEMO_CONTEXT'].includes(threshold.threshold_origin)) {
    errors.push({
      code: 'INVALID_THRESHOLD_CONFIGURATION',
      field: 'threshold.threshold_origin',
      message: 'Unsupported threshold origin',
    });
  }
  if (typeof threshold.policy_id !== 'string' || threshold.policy_id.trim() === '') {
    errors.push({
      code: 'INVALID_THRESHOLD_CONFIGURATION',
      field: 'threshold.policy_id',
      message: 'Threshold policy ID is required',
    });
  }
  if (
    typeof threshold.policy_version !== 'string' ||
    threshold.policy_version.trim() === ''
  ) {
    errors.push({
      code: 'INVALID_THRESHOLD_CONFIGURATION',
      field: 'threshold.policy_version',
      message: 'Threshold policy version is required',
    });
  }
  if (
    threshold.threshold_reference_id !== undefined &&
    (typeof threshold.threshold_reference_id !== 'string' ||
      threshold.threshold_reference_id.trim() === '')
  ) {
    errors.push({
      code: 'INVALID_THRESHOLD_CONFIGURATION',
      field: 'threshold.threshold_reference_id',
      message: 'Threshold reference ID must be non-empty when supplied',
    });
  }
  return errors;
}

function measurementErrors(
  measurements: readonly CanonicalTimeSeriesMeasurement[],
): TemperatureAnalysisError[] {
  const errors: TemperatureAnalysisError[] = [];
  measurements.forEach((measurement, index) => {
    const validation = CanonicalTimeSeriesMeasurementSchema.safeParse(measurement);
    if (!validation.success) {
      errors.push({
        code: 'INVALID_CANONICAL_MEASUREMENT',
        field: `measurements.${index}`,
        message: validation.error.issues.map((issue) => issue.message).join('; '),
      });
    } else if (measurement.temperature_c === undefined) {
      errors.push({
        code: 'INVALID_CANONICAL_MEASUREMENT',
        field: `measurements.${index}.temperature_c`,
        message: 'D11 requires canonical measurements with a physical temperature value',
      });
    }
  });
  return errors;
}

function directionFor(
  temperature: number,
  threshold: TemperatureThreshold,
): TemperatureExcursionDirection | undefined {
  if (temperature < threshold.min_temperature_c) return 'BELOW_MINIMUM';
  if (temperature > threshold.max_temperature_c) return 'ABOVE_MAXIMUM';
  return undefined;
}

function deterministicExcursionId(value: unknown): string {
  return `texc_${createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex')}`;
}

function relatedFindingIds(
  findings: readonly RuntimeDataQualityFinding[],
  recordIds: readonly string[],
  additionalFindingIds: readonly string[],
): string[] {
  const records = new Set(recordIds);
  return [...new Set([
    ...findings
      .filter((finding) => finding.record_ids.some((recordId) => records.has(recordId)))
      .map((finding) => finding.finding_id),
    ...additionalFindingIds,
  ])];
}

function finalizeEpisode(
  active: ActiveEpisode,
  device: RuntimeDeviceIdentity,
  threshold: TemperatureThreshold,
  terminationReason: TemperatureExcursionTerminationReason,
  endAt: string | null,
  continuityUncertain: boolean,
  findings: readonly RuntimeDataQualityFinding[],
  additionalFindingIds: readonly string[] = [],
): TemperatureExcursionEpisode {
  const first = active.records[0];
  const last = active.records[active.records.length - 1];
  const temperatures = active.records.map(
    ({ measurement }) => measurement.temperature_c as number,
  );
  const contributingRecordIds = active.records.map(
    ({ measurement }) => measurement.record_id,
  );
  const extremeTemperature = active.direction === 'ABOVE_MAXIMUM'
    ? Math.max(...temperatures)
    : Math.min(...temperatures);
  const thresholdTemperature = active.direction === 'ABOVE_MAXIMUM'
    ? threshold.max_temperature_c
    : threshold.min_temperature_c;
  const episodeWindowDuration = endAt === null
    ? null
    : Date.parse(endAt) - first.epochMilliseconds;
  const findingIds = relatedFindingIds(
    findings,
    contributingRecordIds,
    additionalFindingIds,
  );
  const identity = [
    SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_ID,
    SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_VERSION,
    deviceKey(device),
    active.direction,
    first.measurement.timestamp,
    endAt,
    contributingRecordIds,
    terminationReason,
  ];

  return {
    excursion_id: deterministicExcursionId(identity),
    device,
    direction: active.direction,
    start_at: first.measurement.timestamp,
    end_at: endAt,
    open_ended: endAt === null,
    first_record_id: first.measurement.record_id,
    last_out_of_range_record_id: last.measurement.record_id,
    last_out_of_range_at: last.measurement.timestamp,
    contributing_record_ids: contributingRecordIds,
    out_of_range_sample_count: active.records.length,
    extreme_temperature_c: extremeTemperature,
    threshold_temperature_c: thresholdTemperature,
    observed_span_ms: last.epochMilliseconds - first.epochMilliseconds,
    episode_window_duration_ms: episodeWindowDuration,
    termination_reason: terminationReason,
    continuity_uncertain: continuityUncertain,
    data_quality_finding_ids: findingIds,
    policy_id: SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_ID,
    policy_version: SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_VERSION,
  };
}

function successfulDqFindings(
  result: RuntimeDataQualityResult | undefined,
): RuntimeDataQualityFinding[] {
  return result?.success === true ? result.findings : [];
}

function gapsByDeviceAndCurrentTimestamp(
  findings: readonly RuntimeDataQualityFinding[],
): Map<string, Map<string, RuntimeDataQualityFinding[]>> {
  const result = new Map<string, Map<string, RuntimeDataQualityFinding[]>>();
  for (const finding of findings) {
    if (finding.code !== 'MISSING_INTERVAL') continue;
    const key = deviceKey(finding.device);
    const byTimestamp = result.get(key) ?? new Map<string, RuntimeDataQualityFinding[]>();
    const atTimestamp = byTimestamp.get(finding.evidence.current_timestamp) ?? [];
    atTimestamp.push(finding);
    byTimestamp.set(finding.evidence.current_timestamp, atTimestamp);
    result.set(key, byTimestamp);
  }
  return result;
}

function analyzeStream(
  device: RuntimeDeviceIdentity,
  records: IndexedMeasurement[],
  threshold: TemperatureThreshold,
  findings: readonly RuntimeDataQualityFinding[],
  gaps: ReadonlyMap<string, RuntimeDataQualityFinding[]>,
): { stream: TemperatureStreamResult; episodes: TemperatureExcursionEpisode[] } {
  const sorted = [...records].sort(
    (left, right) =>
      left.epochMilliseconds - right.epochMilliseconds ||
      left.inputIndex - right.inputIndex,
  );
  const episodes: TemperatureExcursionEpisode[] = [];
  let active: ActiveEpisode | undefined;
  let previousTimestamp: string | undefined;

  for (const record of sorted) {
    const timestamp = record.measurement.timestamp;
    if (timestamp !== previousTimestamp) {
      const gapFindings = gaps.get(timestamp) ?? [];
      if (active !== undefined && gapFindings.length > 0) {
        episodes.push(finalizeEpisode(
          active,
          device,
          threshold,
          'DATA_GAP',
          null,
          true,
          findings,
          gapFindings.map((finding) => finding.finding_id),
        ));
        active = undefined;
      }
      previousTimestamp = timestamp;
    }

    const direction = directionFor(record.measurement.temperature_c as number, threshold);
    if (direction === undefined) {
      if (active !== undefined) {
        episodes.push(finalizeEpisode(
          active,
          device,
          threshold,
          'RETURNED_IN_RANGE',
          timestamp,
          false,
          findings,
        ));
        active = undefined;
      }
      continue;
    }

    if (active === undefined) {
      active = { direction, records: [record] };
    } else if (active.direction === direction) {
      active.records.push(record);
    } else {
      episodes.push(finalizeEpisode(
        active,
        device,
        threshold,
        'DIRECTION_CHANGED',
        timestamp,
        false,
        findings,
      ));
      active = { direction, records: [record] };
    }
  }

  if (active !== undefined) {
    episodes.push(finalizeEpisode(
      active,
      device,
      threshold,
      'SEQUENCE_END',
      null,
      false,
      findings,
    ));
  }

  const temperatures = sorted.map(
    ({ measurement }) => measurement.temperature_c as number,
  );
  return {
    stream: {
      device,
      temperature_status: episodes.length > 0 ? 'EXCURSION_DETECTED' : 'IN_RANGE',
      measurement_count: sorted.length,
      excursion_count: episodes.length,
      excursion_ids: episodes.map((episode) => episode.excursion_id),
      minimum_observed_temperature_c: Math.min(...temperatures),
      maximum_observed_temperature_c: Math.max(...temperatures),
      first_observed_at: sorted[0].measurement.timestamp,
      last_observed_at: sorted[sorted.length - 1].measurement.timestamp,
    },
    episodes,
  };
}

/**
 * Pure shipment-aware temperature analysis. It classifies supplied canonical
 * values only; it does not infer thresholds, persist data, or make QA decisions.
 */
export function analyzeShipmentTemperatures(
  input: TemperatureAnalysisInput,
): ShipmentTemperatureAnalysisResult {
  const dqContext = dataQualityContext(input.data_quality_result);
  const common = {
    policy: APPLIED_POLICY,
    data_quality_context: dqContext,
    ...(input.shipment_reference !== undefined
      ? { shipment_reference: input.shipment_reference }
      : {}),
  };
  const errors = [
    ...thresholdErrors(input.threshold),
    ...measurementErrors(input.measurements),
  ];
  if (errors.length > 0) {
    return {
      ...common,
      success: false,
      temperature_status: 'NOT_ASSESSED',
      errors,
      episodes: [],
      streams: [],
      summary: emptySummary(input.measurements.length),
    };
  }
  if (input.measurements.length === 0) {
    return {
      ...common,
      success: true,
      temperature_status: 'NOT_ASSESSED',
      threshold: input.threshold,
      reason: {
        code: 'NO_CANONICAL_MEASUREMENTS',
        message: 'No canonical temperature measurements were supplied',
      },
      episodes: [],
      streams: [],
      summary: emptySummary(),
    };
  }

  const streams = new Map<string, { device: RuntimeDeviceIdentity; records: IndexedMeasurement[] }>();
  input.measurements.forEach((measurement, inputIndex) => {
    const device = deviceIdentity(measurement);
    const key = deviceKey(device);
    const stream = streams.get(key) ?? { device, records: [] };
    stream.records.push({
      measurement,
      epochMilliseconds: Date.parse(measurement.timestamp),
      inputIndex,
    });
    streams.set(key, stream);
  });

  const findings = successfulDqFindings(input.data_quality_result);
  const gapLookup = gapsByDeviceAndCurrentTimestamp(findings);
  const streamResults: TemperatureStreamResult[] = [];
  const episodes: TemperatureExcursionEpisode[] = [];
  for (const key of [...streams.keys()].sort()) {
    const stream = streams.get(key) as { device: RuntimeDeviceIdentity; records: IndexedMeasurement[] };
    const analyzed = analyzeStream(
      stream.device,
      stream.records,
      input.threshold,
      findings,
      gapLookup.get(key) ?? new Map(),
    );
    streamResults.push(analyzed.stream);
    episodes.push(...analyzed.episodes);
  }

  const temperatures = input.measurements.map(
    (measurement) => measurement.temperature_c as number,
  );
  const chronological = input.measurements
    .map((measurement, inputIndex) => ({
      measurement,
      epochMilliseconds: Date.parse(measurement.timestamp),
      inputIndex,
    }))
    .sort(
      (left, right) =>
        left.epochMilliseconds - right.epochMilliseconds ||
        left.inputIndex - right.inputIndex,
    );
  const summary: TemperatureAnalysisSummary = {
    measurement_count: input.measurements.length,
    stream_count: streamResults.length,
    streams_in_range: streamResults.filter(
      (stream) => stream.temperature_status === 'IN_RANGE',
    ).length,
    streams_with_excursion: streamResults.filter(
      (stream) => stream.temperature_status === 'EXCURSION_DETECTED',
    ).length,
    excursion_count: episodes.length,
    above_excursion_count: episodes.filter(
      (episode) => episode.direction === 'ABOVE_MAXIMUM',
    ).length,
    below_excursion_count: episodes.filter(
      (episode) => episode.direction === 'BELOW_MINIMUM',
    ).length,
    minimum_observed_temperature_c: Math.min(...temperatures),
    maximum_observed_temperature_c: Math.max(...temperatures),
    first_observed_at: chronological[0].measurement.timestamp,
    last_observed_at: chronological[chronological.length - 1].measurement.timestamp,
  };

  return {
    ...common,
    success: true,
    temperature_status: episodes.length > 0 ? 'EXCURSION_DETECTED' : 'IN_RANGE',
    threshold: input.threshold,
    episodes,
    streams: streamResults,
    summary,
  };
}
