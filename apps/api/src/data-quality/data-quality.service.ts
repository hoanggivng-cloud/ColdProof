import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { CanonicalTimeSeriesMeasurement } from '@coldproof/canonical-schema';
import type { ScaffoldStatus } from '@coldproof/shared-types';

import type {
  AppliedDataQualityPolicy,
  DataQualityError,
  DataQualityPolicy,
  DataQualityResult,
  DuplicateTimestampContext,
  MissingIntervalContext,
  OutOfOrderTimestampContext,
  StreamIdentity,
  StreamQualitySummary,
  TimeSeriesQualityIssue,
} from './data-quality.types';

type IndexedMeasurement = {
  measurement: CanonicalTimeSeriesMeasurement;
  epochMilliseconds: number;
  inputIndex: number;
};

function streamIdentity(measurement: CanonicalTimeSeriesMeasurement): StreamIdentity {
  return {
    source_dataset: measurement.source_dataset,
    source_file: measurement.source_file,
    source_sensor_id: measurement.source_sensor_id,
  };
}

function streamKey(stream: StreamIdentity): string {
  return JSON.stringify([stream.source_dataset, stream.source_file, stream.source_sensor_id]);
}

function deterministicUuid(value: unknown): string {
  const bytes = createHash('sha256').update(JSON.stringify(value), 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function createIssue(
  code: 'MISSING_INTERVAL',
  stream: StreamIdentity,
  recordIds: string[],
  detail: string,
  context: MissingIntervalContext,
): Extract<TimeSeriesQualityIssue, { code: 'MISSING_INTERVAL' }>;
function createIssue(
  code: 'DUPLICATE_TIMESTAMP',
  stream: StreamIdentity,
  recordIds: string[],
  detail: string,
  context: DuplicateTimestampContext,
): Extract<TimeSeriesQualityIssue, { code: 'DUPLICATE_TIMESTAMP' }>;
function createIssue(
  code: 'OUT_OF_ORDER_TIMESTAMP',
  stream: StreamIdentity,
  recordIds: string[],
  detail: string,
  context: OutOfOrderTimestampContext,
): Extract<TimeSeriesQualityIssue, { code: 'OUT_OF_ORDER_TIMESTAMP' }>;
function createIssue(
  code: TimeSeriesQualityIssue['code'],
  stream: StreamIdentity,
  recordIds: string[],
  detail: string,
  context: MissingIntervalContext | DuplicateTimestampContext | OutOfOrderTimestampContext,
): TimeSeriesQualityIssue {
  const id = deterministicUuid([code, streamKey(stream), recordIds, context]);
  return { id, code, record_ids: recordIds, detail, stream, context } as TimeSeriesQualityIssue;
}

function validatePolicy(policy: DataQualityPolicy):
  | { success: true; policy: AppliedDataQualityPolicy }
  | { success: false; errors: DataQualityError[] } {
  const errors: DataQualityError[] = [];
  const toleranceSeconds = policy.toleranceSeconds ?? 0;

  if (!Number.isFinite(policy.expectedIntervalSeconds) || policy.expectedIntervalSeconds <= 0) {
    errors.push({
      code: 'INVALID_POLICY',
      field: 'expectedIntervalSeconds',
      message: 'expectedIntervalSeconds must be finite and greater than zero',
    });
  }

  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) {
    errors.push({
      code: 'INVALID_POLICY',
      field: 'toleranceSeconds',
      message: 'toleranceSeconds must be finite and greater than or equal to zero',
    });
  }

  return errors.length > 0
    ? { success: false, errors }
    : {
        success: true,
        policy: { expectedIntervalSeconds: policy.expectedIntervalSeconds, toleranceSeconds },
      };
}

@Injectable()
export class DataQualityService {
  status(): ScaffoldStatus {
    return {
      module: 'data-quality',
      status: 'TODO',
      message: 'Time-series quality checks are available; persistence/orchestration remains TODO.',
    };
  }

  evaluateTimeSeries(
    measurements: readonly CanonicalTimeSeriesMeasurement[],
    policy: DataQualityPolicy,
  ): DataQualityResult {
    const policyValidation = validatePolicy(policy);
    if (!policyValidation.success) return policyValidation;

    const appliedPolicy = policyValidation.policy;
    const streams = new Map<
      string,
      { identity: StreamIdentity; records: IndexedMeasurement[] }
    >();

    for (let inputIndex = 0; inputIndex < measurements.length; inputIndex += 1) {
      const measurement = measurements[inputIndex];
      const identity = streamIdentity(measurement);
      const key = streamKey(identity);
      const stream = streams.get(key) ?? { identity, records: [] };
      stream.records.push({
        measurement,
        epochMilliseconds: Date.parse(measurement.timestamp),
        inputIndex,
      });
      streams.set(key, stream);
    }

    const issues: TimeSeriesQualityIssue[] = [];
    const streamSummaries: StreamQualitySummary[] = [];

    for (const stream of streams.values()) {
      const streamIssues: TimeSeriesQualityIssue[] = [];
      const recordsByTimestamp = new Map<number, IndexedMeasurement[]>();

      for (const record of stream.records) {
        const sameTimestamp = recordsByTimestamp.get(record.epochMilliseconds) ?? [];
        sameTimestamp.push(record);
        recordsByTimestamp.set(record.epochMilliseconds, sameTimestamp);
      }

      for (const records of recordsByTimestamp.values()) {
        const seenRecordIds = new Set<string>();
        const distinctRecords = records.filter((record) => {
          if (seenRecordIds.has(record.measurement.record_id)) return false;
          seenRecordIds.add(record.measurement.record_id);
          return true;
        });
        if (distinctRecords.length < 2) continue;

        const recordIds = distinctRecords.map((record) => record.measurement.record_id);
        const timestamp = distinctRecords[0].measurement.timestamp;
        const context: DuplicateTimestampContext = {
          timestamp,
          duplicate_count: distinctRecords.length,
        };
        streamIssues.push(
          createIssue(
            'DUPLICATE_TIMESTAMP',
            stream.identity,
            recordIds,
            `${distinctRecords.length} records share timestamp ${timestamp}`,
            context,
          ),
        );
      }

      for (let index = 1; index < stream.records.length; index += 1) {
        const previous = stream.records[index - 1];
        const next = stream.records[index];
        if (next.epochMilliseconds >= previous.epochMilliseconds) continue;

        const context: OutOfOrderTimestampContext = {
          previous_record_id: previous.measurement.record_id,
          next_record_id: next.measurement.record_id,
          previous_timestamp: previous.measurement.timestamp,
          next_timestamp: next.measurement.timestamp,
        };
        streamIssues.push(
          createIssue(
            'OUT_OF_ORDER_TIMESTAMP',
            stream.identity,
            [previous.measurement.record_id, next.measurement.record_id],
            `Timestamp decreased from ${previous.measurement.timestamp} to ${next.measurement.timestamp}`,
            context,
          ),
        );
      }

      const chronological = [...stream.records].sort(
        (left, right) =>
          left.epochMilliseconds - right.epochMilliseconds || left.inputIndex - right.inputIndex,
      );
      const uniqueChronological = chronological.filter(
        (record, index) =>
          index === 0 || record.epochMilliseconds !== chronological[index - 1].epochMilliseconds,
      );
      let largestObservedGapSeconds = 0;

      for (let index = 1; index < uniqueChronological.length; index += 1) {
        const previous = uniqueChronological[index - 1];
        const next = uniqueChronological[index];
        const observedGapSeconds =
          (next.epochMilliseconds - previous.epochMilliseconds) / 1_000;
        largestObservedGapSeconds = Math.max(largestObservedGapSeconds, observedGapSeconds);
        const missingCount = Math.max(
          0,
          Math.ceil(
            (observedGapSeconds - appliedPolicy.toleranceSeconds) /
              appliedPolicy.expectedIntervalSeconds,
          ) - 1,
        );
        if (missingCount === 0) continue;

        const context: MissingIntervalContext = {
          previous_record_id: previous.measurement.record_id,
          next_record_id: next.measurement.record_id,
          previous_timestamp: previous.measurement.timestamp,
          next_timestamp: next.measurement.timestamp,
          expected_interval_seconds: appliedPolicy.expectedIntervalSeconds,
          tolerance_seconds: appliedPolicy.toleranceSeconds,
          observed_gap_seconds: observedGapSeconds,
          missing_count: missingCount,
        };
        streamIssues.push(
          createIssue(
            'MISSING_INTERVAL',
            stream.identity,
            [previous.measurement.record_id, next.measurement.record_id],
            `Observed ${observedGapSeconds}s gap; ${missingCount} expected sample(s) missing`,
            context,
          ),
        );
      }

      issues.push(...streamIssues);
      streamSummaries.push({
        stream: stream.identity,
        measurementCount: stream.records.length,
        issueCount: streamIssues.length,
        missingIntervalCount: streamIssues.filter(
          (issue) => issue.code === 'MISSING_INTERVAL',
        ).length,
        duplicateTimestampCount: streamIssues.filter(
          (issue) => issue.code === 'DUPLICATE_TIMESTAMP',
        ).length,
        outOfOrderCount: streamIssues.filter(
          (issue) => issue.code === 'OUT_OF_ORDER_TIMESTAMP',
        ).length,
        largestObservedGapSeconds,
      });
    }

    const summary = {
      measurementCount: measurements.length,
      streamCount: streams.size,
      issueCount: issues.length,
      missingIntervalCount: issues.filter((issue) => issue.code === 'MISSING_INTERVAL').length,
      duplicateTimestampCount: issues.filter(
        (issue) => issue.code === 'DUPLICATE_TIMESTAMP',
      ).length,
      outOfOrderCount: issues.filter((issue) => issue.code === 'OUT_OF_ORDER_TIMESTAMP').length,
      streams: streamSummaries,
    };

    return { success: true, policy: appliedPolicy, issues, summary };
  }
}
