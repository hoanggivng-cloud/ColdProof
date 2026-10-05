import type {
  CanonicalTimeSeriesMeasurement,
  SpatialMeasurement,
} from '@coldproof/canonical-schema';

export type TimezoneOrigin = 'SOURCE_DECLARED' | 'EXPLICIT_ASSUMPTION';

export interface ParserIdentityContext {
  parserId: string;
  parserVersion: string;
}

export interface NormalizationContext extends ParserIdentityContext {
  timezoneOffset?: string;
  timezoneOrigin?: TimezoneOrigin;
}

export type SpatialNormalizationContext = ParserIdentityContext;

export interface AppliedNormalizationContext {
  parserId: string;
  parserVersion: string;
  timezoneOffset: string;
  timezoneOrigin: TimezoneOrigin;
}

export interface AppliedSpatialNormalizationContext {
  parserId: string;
  parserVersion: string;
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
  | 'INVALID_CONDITION_ID'
  | 'INVALID_COORDINATE'
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

export type SpatialNormalizationResult =
  | {
      success: true;
      measurement: SpatialMeasurement;
      appliedContext: AppliedSpatialNormalizationContext;
    }
  | {
      success: false;
      errors: NormalizationError[];
    };
