import { createHash } from 'node:crypto';

import type { CanonicalTimeSeriesMeasurement } from '@coldproof/canonical-schema';
import type { LoggerDataQualityCode } from '@coldproof/parser-contracts';

export const RUNTIME_DQ_POLICY_ID = 'runtime-dq-v1';

export type RuntimeDataQualityAssessmentStatus =
  | 'NOT_ASSESSED'
  | 'PASS'
  | 'FLAGGED';

export type RuntimeDataQualityFindingCode = Extract<
  LoggerDataQualityCode,
  | 'DUPLICATE_RECORD'
  | 'CONFLICTING_RECORD'
  | 'OUT_OF_ORDER_RECORD'
  | 'MISSING_INTERVAL'
>;

export interface RuntimeDataQualityContext {
  expected_interval_ms?: number;
  tolerance_ms?: number;
}

export interface AppliedRuntimeDataQualityPolicy {
  policy_id: typeof RUNTIME_DQ_POLICY_ID;
  expected_interval_ms?: number;
  tolerance_ms: number;
  interval_semantics: '[start,end)';
}

export interface RuntimeDeviceIdentity {
  source_dataset: string;
  source_format: string;
  source_sensor_id: string;
}

interface FindingBase<Code extends RuntimeDataQualityFindingCode, Evidence> {
  finding_id: string;
  code: Code;
  record_ids: string[];
  device: RuntimeDeviceIdentity;
  evidence: Evidence;
}

export interface DuplicateRecordEvidence {
  timestamp: string;
  temperature_c: number;
  humidity_pct?: number;
}

export interface ConflictingRecordValue {
  record_id: string;
  temperature_c: number;
  humidity_pct?: number;
}

export interface ConflictingRecordEvidence {
  timestamp: string;
  values: ConflictingRecordValue[];
}

export interface OutOfOrderRecordEvidence {
  previous_record_id: string;
  current_record_id: string;
  previous_timestamp: string;
  current_timestamp: string;
  regression_ms: number;
}

export interface MissingIntervalEvidence {
  previous_record_id: string;
  current_record_id: string;
  previous_timestamp: string;
  current_timestamp: string;
  interval: {
    start: string;
    end: string;
    semantics: '[start,end)';
  };
  observed_delta_ms: number;
  expected_interval_ms: number;
  tolerance_ms: number;
  estimated_missing_count?: number;
}

export type RuntimeDataQualityFinding =
  | FindingBase<'DUPLICATE_RECORD', DuplicateRecordEvidence>
  | FindingBase<'CONFLICTING_RECORD', ConflictingRecordEvidence>
  | FindingBase<'OUT_OF_ORDER_RECORD', OutOfOrderRecordEvidence>
  | FindingBase<'MISSING_INTERVAL', MissingIntervalEvidence>;

export interface RuntimeRecordAssessment {
  record_id: string;
  status: Exclude<RuntimeDataQualityAssessmentStatus, 'NOT_ASSESSED'>;
  finding_ids: string[];
}

export interface RuntimeDataQualitySummary {
  measurement_count: number;
  device_count: number;
  finding_count: number;
  duplicate_record_count: number;
  conflicting_record_count: number;
  out_of_order_record_count: number;
  missing_interval_count: number;
  estimated_missing_sample_count: number;
}

export interface RuntimeDataQualityError {
  code: 'INVALID_DQ_CONFIGURATION';
  field: 'expected_interval_ms' | 'tolerance_ms';
  message: string;
}

export type RuntimeDataQualityResult =
  | {
      success: true;
      assessment_status: Exclude<
        RuntimeDataQualityAssessmentStatus,
        'NOT_ASSESSED'
      >;
      policy: AppliedRuntimeDataQualityPolicy;
      findings: RuntimeDataQualityFinding[];
      record_assessments: RuntimeRecordAssessment[];
      summary: RuntimeDataQualitySummary;
    }
  | {
      success: false;
      assessment_status: 'NOT_ASSESSED';
      policy_id: typeof RUNTIME_DQ_POLICY_ID;
      errors: RuntimeDataQualityError[];
    };

type IndexedMeasurement = {
  measurement: CanonicalTimeSeriesMeasurement;
  epochMilliseconds: number;
  inputIndex: number;
};

type DeviceStream = {
  identity: RuntimeDeviceIdentity;
  records: IndexedMeasurement[];
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

function physicalSignature(measurement: CanonicalTimeSeriesMeasurement): string {
  return JSON.stringify([
    measurement.temperature_c,
    measurement.humidity_pct === undefined
      ? { present: false }
      : { present: true, value: measurement.humidity_pct },
  ]);
}

function deterministicFindingId(value: unknown): string {
  return `dq_${createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex')}`;
}

function createFinding<
  Code extends RuntimeDataQualityFindingCode,
  Evidence,
>(
  code: Code,
  device: RuntimeDeviceIdentity,
  recordIds: string[],
  evidence: Evidence,
): FindingBase<Code, Evidence> {
  return {
    finding_id: deterministicFindingId([
      RUNTIME_DQ_POLICY_ID,
      code,
      deviceKey(device),
      recordIds,
      evidence,
    ]),
    code,
    record_ids: recordIds,
    device,
    evidence,
  };
}

function validateContext(
  context: RuntimeDataQualityContext,
):
  | { success: true; policy: AppliedRuntimeDataQualityPolicy }
  | { success: false; errors: RuntimeDataQualityError[] } {
  const errors: RuntimeDataQualityError[] = [];
  const expected = context.expected_interval_ms;
  const tolerance = context.tolerance_ms ?? 0;

  if (
    expected !== undefined &&
    (!Number.isFinite(expected) || expected <= 0)
  ) {
    errors.push({
      code: 'INVALID_DQ_CONFIGURATION',
      field: 'expected_interval_ms',
      message: 'expected_interval_ms must be finite and greater than zero',
    });
  }
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    errors.push({
      code: 'INVALID_DQ_CONFIGURATION',
      field: 'tolerance_ms',
      message: 'tolerance_ms must be finite and greater than or equal to zero',
    });
  } else if (expected === undefined && context.tolerance_ms !== undefined) {
    errors.push({
      code: 'INVALID_DQ_CONFIGURATION',
      field: 'tolerance_ms',
      message: 'tolerance_ms requires expected_interval_ms',
    });
  }

  if (errors.length > 0) return { success: false, errors };
  return {
    success: true,
    policy: {
      policy_id: RUNTIME_DQ_POLICY_ID,
      ...(expected !== undefined ? { expected_interval_ms: expected } : {}),
      tolerance_ms: tolerance,
      interval_semantics: '[start,end)',
    },
  };
}

function distinctRecords(records: IndexedMeasurement[]): IndexedMeasurement[] {
  const seenRecordIds = new Set<string>();
  return records.filter((record) => {
    if (seenRecordIds.has(record.measurement.record_id)) return false;
    seenRecordIds.add(record.measurement.record_id);
    return true;
  });
}

function duplicateAndConflictFindings(
  stream: DeviceStream,
): RuntimeDataQualityFinding[] {
  const findings: RuntimeDataQualityFinding[] = [];
  const recordsByTimestamp = new Map<number, IndexedMeasurement[]>();
  for (const record of stream.records) {
    const records = recordsByTimestamp.get(record.epochMilliseconds) ?? [];
    records.push(record);
    recordsByTimestamp.set(record.epochMilliseconds, records);
  }

  for (const timestampRecords of recordsByTimestamp.values()) {
    const records = distinctRecords(timestampRecords);
    if (records.length < 2) continue;
    const equivalenceGroups = new Map<string, IndexedMeasurement[]>();
    for (const record of records) {
      const signature = physicalSignature(record.measurement);
      const group = equivalenceGroups.get(signature) ?? [];
      group.push(record);
      equivalenceGroups.set(signature, group);
    }

    for (const equivalentRecords of equivalenceGroups.values()) {
      if (equivalentRecords.length < 2) continue;
      const first = equivalentRecords[0].measurement;
      findings.push(
        createFinding(
          'DUPLICATE_RECORD',
          stream.identity,
          equivalentRecords.map((record) => record.measurement.record_id),
          {
            timestamp: first.timestamp,
            temperature_c: first.temperature_c as number,
            ...(first.humidity_pct !== undefined
              ? { humidity_pct: first.humidity_pct }
              : {}),
          },
        ),
      );
    }

    if (equivalenceGroups.size > 1) {
      const first = records[0].measurement;
      findings.push(
        createFinding(
          'CONFLICTING_RECORD',
          stream.identity,
          records.map((record) => record.measurement.record_id),
          {
            timestamp: first.timestamp,
            values: records.map(({ measurement }) => ({
              record_id: measurement.record_id,
              temperature_c: measurement.temperature_c as number,
              ...(measurement.humidity_pct !== undefined
                ? { humidity_pct: measurement.humidity_pct }
                : {}),
            })),
          },
        ),
      );
    }
  }
  return findings;
}

function outOfOrderFindings(
  stream: DeviceStream,
): RuntimeDataQualityFinding[] {
  const findings: RuntimeDataQualityFinding[] = [];
  for (let index = 1; index < stream.records.length; index += 1) {
    const previous = stream.records[index - 1];
    const current = stream.records[index];
    if (current.epochMilliseconds >= previous.epochMilliseconds) continue;
    findings.push(
      createFinding(
        'OUT_OF_ORDER_RECORD',
        stream.identity,
        [previous.measurement.record_id, current.measurement.record_id],
        {
          previous_record_id: previous.measurement.record_id,
          current_record_id: current.measurement.record_id,
          previous_timestamp: previous.measurement.timestamp,
          current_timestamp: current.measurement.timestamp,
          regression_ms:
            previous.epochMilliseconds - current.epochMilliseconds,
        },
      ),
    );
  }
  return findings;
}

function exactMissingCount(
  observedDeltaMs: number,
  expectedIntervalMs: number,
): number | undefined {
  if (observedDeltaMs % expectedIntervalMs !== 0) return undefined;
  return Math.max(0, observedDeltaMs / expectedIntervalMs - 1);
}

function missingIntervalFindings(
  stream: DeviceStream,
  policy: AppliedRuntimeDataQualityPolicy,
): RuntimeDataQualityFinding[] {
  const expected = policy.expected_interval_ms;
  if (expected === undefined) return [];

  const chronological = [...stream.records].sort(
    (left, right) =>
      left.epochMilliseconds - right.epochMilliseconds ||
      left.inputIndex - right.inputIndex,
  );
  const uniqueInstants = chronological.filter(
    (record, index) =>
      index === 0 ||
      record.epochMilliseconds !== chronological[index - 1].epochMilliseconds,
  );
  const findings: RuntimeDataQualityFinding[] = [];

  for (let index = 1; index < uniqueInstants.length; index += 1) {
    const previous = uniqueInstants[index - 1];
    const current = uniqueInstants[index];
    const observedDeltaMs =
      current.epochMilliseconds - previous.epochMilliseconds;
    if (observedDeltaMs <= expected + policy.tolerance_ms) continue;
    const estimatedMissingCount = exactMissingCount(observedDeltaMs, expected);
    findings.push(
      createFinding(
        'MISSING_INTERVAL',
        stream.identity,
        [previous.measurement.record_id, current.measurement.record_id],
        {
          previous_record_id: previous.measurement.record_id,
          current_record_id: current.measurement.record_id,
          previous_timestamp: previous.measurement.timestamp,
          current_timestamp: current.measurement.timestamp,
          interval: {
            start: previous.measurement.timestamp,
            end: current.measurement.timestamp,
            semantics: '[start,end)' as const,
          },
          observed_delta_ms: observedDeltaMs,
          expected_interval_ms: expected,
          tolerance_ms: policy.tolerance_ms,
          ...(estimatedMissingCount !== undefined
            ? { estimated_missing_count: estimatedMissingCount }
            : {}),
        },
      ),
    );
  }
  return findings;
}

/**
 * Pure, non-destructive runtime sequence assessment for D5 canonical records.
 */
export function assessLoggerSequence(
  measurements: readonly CanonicalTimeSeriesMeasurement[],
  context: RuntimeDataQualityContext = {},
): RuntimeDataQualityResult {
  const contextValidation = validateContext(context);
  if (!contextValidation.success) {
    return {
      success: false,
      assessment_status: 'NOT_ASSESSED',
      policy_id: RUNTIME_DQ_POLICY_ID,
      errors: contextValidation.errors,
    };
  }
  const policy = contextValidation.policy;
  const streams = new Map<string, DeviceStream>();
  for (let inputIndex = 0; inputIndex < measurements.length; inputIndex += 1) {
    const measurement = measurements[inputIndex];
    const identity = deviceIdentity(measurement);
    const key = deviceKey(identity);
    const stream = streams.get(key) ?? { identity, records: [] };
    stream.records.push({
      measurement,
      epochMilliseconds: Date.parse(measurement.timestamp),
      inputIndex,
    });
    streams.set(key, stream);
  }

  const findings: RuntimeDataQualityFinding[] = [];
  for (const stream of streams.values()) {
    findings.push(...duplicateAndConflictFindings(stream));
    findings.push(...outOfOrderFindings(stream));
    findings.push(...missingIntervalFindings(stream, policy));
  }

  const findingIdsByRecord = new Map<string, string[]>();
  for (const finding of findings) {
    for (const recordId of finding.record_ids) {
      const findingIds = findingIdsByRecord.get(recordId) ?? [];
      findingIds.push(finding.finding_id);
      findingIdsByRecord.set(recordId, findingIds);
    }
  }
  const seenAssessmentIds = new Set<string>();
  const recordAssessments: RuntimeRecordAssessment[] = [];
  for (const measurement of measurements) {
    if (seenAssessmentIds.has(measurement.record_id)) continue;
    seenAssessmentIds.add(measurement.record_id);
    const findingIds = findingIdsByRecord.get(measurement.record_id) ?? [];
    recordAssessments.push({
      record_id: measurement.record_id,
      status: findingIds.length > 0 ? 'FLAGGED' : 'PASS',
      finding_ids: findingIds,
    });
  }

  const summary: RuntimeDataQualitySummary = {
    measurement_count: measurements.length,
    device_count: streams.size,
    finding_count: findings.length,
    duplicate_record_count: findings.filter(
      (finding) => finding.code === 'DUPLICATE_RECORD',
    ).length,
    conflicting_record_count: findings.filter(
      (finding) => finding.code === 'CONFLICTING_RECORD',
    ).length,
    out_of_order_record_count: findings.filter(
      (finding) => finding.code === 'OUT_OF_ORDER_RECORD',
    ).length,
    missing_interval_count: findings.filter(
      (finding) => finding.code === 'MISSING_INTERVAL',
    ).length,
    estimated_missing_sample_count: findings.reduce(
      (count, finding) =>
        finding.code === 'MISSING_INTERVAL'
          ? count + (finding.evidence.estimated_missing_count ?? 0)
          : count,
      0,
    ),
  };

  return {
    success: true,
    assessment_status: findings.length > 0 ? 'FLAGGED' : 'PASS',
    policy,
    findings,
    record_assessments: recordAssessments,
    summary,
  };
}
