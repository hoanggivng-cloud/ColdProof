import type { CanonicalTimeSeriesMeasurement } from '@coldproof/canonical-schema';

export type TimezoneOrigin = 'SOURCE_DECLARED' | 'EXPLICIT_ASSUMPTION';

export interface NormalizationContext {
  parserId: string;
  parserVersion: string;
  timezoneOffset?: string;
  timezoneOrigin?: TimezoneOrigin;
}

export interface AppliedNormalizationContext {
  parserId: string;
  parserVersion: string;
  timezoneOffset: string;
  timezoneOrigin: TimezoneOrigin;
}

export type NormalizationErrorCode =
  | 'INVALID_RECORD_TYPE'
  | 'INVALID_PARSER_IDENTITY'
  | 'MISSING_TIMEZONE_CONTEXT'
  | 'INVALID_TIMEZONE_OFFSET'
  | 'INVALID_TIMEZONE_ORIGIN'
  | 'INVALID_PARSED_TIMESTAMP'
  | 'INVALID_TEMPERATURE'
  | 'INVALID_HUMIDITY'
  | 'MISSING_SOURCE_SENSOR_ID'
  | 'PARSER_WARNING'
  | 'CANONICAL_VALIDATION_FAILED';

export interface NormalizationError {
  code: NormalizationErrorCode;
  message: string;
  field?: string;
  parserWarning?: string;
}

export type NormalizationResult =
  | {
      success: true;
      measurement: CanonicalTimeSeriesMeasurement;
      appliedContext: AppliedNormalizationContext;
    }
  | {
      success: false;
      errors: NormalizationError[];
    };
