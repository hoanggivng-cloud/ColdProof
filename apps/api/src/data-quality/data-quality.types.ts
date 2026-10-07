import type { QualityIssue } from '@coldproof/shared-types';

export interface DataQualityPolicy {
  expectedIntervalSeconds: number;
  toleranceSeconds?: number;
}

export interface AppliedDataQualityPolicy {
  expectedIntervalSeconds: number;
  toleranceSeconds: number;
}

export interface StreamIdentity {
  source_dataset: string;
  source_file: string;
  source_sensor_id: string;
}

export interface MissingIntervalContext {
  previous_record_id: string;
  next_record_id: string;
  previous_timestamp: string;
  next_timestamp: string;
  expected_interval_seconds: number;
  tolerance_seconds: number;
  observed_gap_seconds: number;
  missing_count: number;
}

export interface DuplicateTimestampContext {
  timestamp: string;
  duplicate_count: number;
}

export interface OutOfOrderTimestampContext {
  previous_record_id: string;
  next_record_id: string;
  previous_timestamp: string;
  next_timestamp: string;
}

type TypedQualityIssue<
  Code extends QualityIssue['code'],
  Context,
> = QualityIssue & {
  code: Code;
  stream: StreamIdentity;
  context: Context;
};

export type TimeSeriesQualityIssue =
  | TypedQualityIssue<'MISSING_INTERVAL', MissingIntervalContext>
  | TypedQualityIssue<'DUPLICATE_TIMESTAMP', DuplicateTimestampContext>
  | TypedQualityIssue<'OUT_OF_ORDER_TIMESTAMP', OutOfOrderTimestampContext>;

export interface StreamQualitySummary {
  stream: StreamIdentity;
  measurementCount: number;
  issueCount: number;
  missingIntervalCount: number;
  duplicateTimestampCount: number;
  outOfOrderCount: number;
  largestObservedGapSeconds: number;
}

export interface DataQualitySummary {
  measurementCount: number;
  streamCount: number;
  issueCount: number;
  missingIntervalCount: number;
  duplicateTimestampCount: number;
  outOfOrderCount: number;
  streams: StreamQualitySummary[];
}

export interface DataQualityError {
  code: 'INVALID_POLICY';
  field: 'expectedIntervalSeconds' | 'toleranceSeconds';
  message: string;
}

export type DataQualityResult =
  | {
      success: true;
      policy: AppliedDataQualityPolicy;
      issues: TimeSeriesQualityIssue[];
      summary: DataQualitySummary;
    }
  | {
      success: false;
      errors: DataQualityError[];
    };
