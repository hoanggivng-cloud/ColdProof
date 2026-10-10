import type { CanonicalTimeSeriesMeasurement } from '@coldproof/canonical-schema';
import {
  normalizeLoggerIngest,
  type LoggerNormalizationContext,
} from '@coldproof/logger-normalizer';
import type {
  LoggerNormalizationResult,
  RawIngestRecord,
} from '@coldproof/parser-contracts';
import {
  assessLoggerSequence,
  type RuntimeDataQualityContext,
  type RuntimeDataQualityResult,
} from '@coldproof/runtime-data-quality';

export const RUNTIME_DATA_PIPELINE_VERSION = 'runtime-data-pipeline-v1';

export interface RuntimeProcessingOptions {
  normalization_context?: LoggerNormalizationContext;
}

type SuccessfulNormalizationResult = Extract<
  LoggerNormalizationResult,
  { success: true }
>;
type FailedNormalizationResult = Extract<
  LoggerNormalizationResult,
  { success: false }
>;

interface RuntimeProcessingResultBase {
  pipeline_version: typeof RUNTIME_DATA_PIPELINE_VERSION;
  ingest_id: string;
  dq_assessment_status: 'NOT_ASSESSED';
}

export type RuntimeProcessingResult =
  | (RuntimeProcessingResultBase & {
      success: true;
      processing_status: 'NORMALIZED';
      normalization: SuccessfulNormalizationResult;
    })
  | (RuntimeProcessingResultBase & {
      success: false;
      processing_status: 'NORMALIZATION_FAILED';
      normalization: FailedNormalizationResult;
    });

/**
 * Orchestrates pure D5 single-record normalization without taking ownership of
 * transport, raw storage, persistence, trip assignment, or sequence DQ.
 */
export function processLoggerIngest(
  rawIngestRecord: RawIngestRecord,
  options: RuntimeProcessingOptions = {},
): RuntimeProcessingResult {
  const normalization = normalizeLoggerIngest(
    rawIngestRecord,
    options.normalization_context,
  );
  const base: RuntimeProcessingResultBase = {
    pipeline_version: RUNTIME_DATA_PIPELINE_VERSION,
    ingest_id: rawIngestRecord.ingest_id,
    dq_assessment_status: 'NOT_ASSESSED',
  };

  if (!normalization.success) {
    return {
      ...base,
      success: false,
      processing_status: 'NORMALIZATION_FAILED',
      normalization,
    };
  }

  return {
    ...base,
    success: true,
    processing_status: 'NORMALIZED',
    normalization,
  };
}

/**
 * Delegates chronological, device-aware sequence assessment to D6. Keeping
 * this separate prevents an isolated normalized record from being presented
 * as if sequence data quality had been assessed.
 */
export function assessProcessedSequence(
  canonicalMeasurements: readonly CanonicalTimeSeriesMeasurement[],
  context: RuntimeDataQualityContext = {},
): RuntimeDataQualityResult {
  return assessLoggerSequence(canonicalMeasurements, context);
}
