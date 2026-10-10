import { createHash } from 'node:crypto';

import {
  CanonicalTimeSeriesMeasurementSchema,
  MeasurementOrigin as MeasurementOriginSchema,
} from '@coldproof/canonical-schema';
import type { MeasurementOrigin, RecordType } from '@coldproof/canonical-schema';
import { z } from 'zod';

const nonEmptyText = z.string().min(1);
const checksumSha256 = z.string().regex(/^[a-f0-9]{64}$/, 'Expected lowercase SHA-256');

export const LoggerSourceType = z.literal('SIMULATED_LOGGER');
export type LoggerSourceType = z.infer<typeof LoggerSourceType>;

export const LoggerSourceFormat = z.enum(['LOGGER_A', 'LOGGER_B', 'UNKNOWN']);
export type LoggerSourceFormat = z.infer<typeof LoggerSourceFormat>;

export const LoggerTimestampSemantics = z.enum([
  'OFFSET_DECLARED_IN_PAYLOAD',
  'SOURCE_LOCAL_TIMEZONE_UNSPECIFIED',
]);
export type LoggerTimestampSemantics = z.infer<typeof LoggerTimestampSemantics>;

export const LoggerDataQualityCode = z.enum([
  'RAW_PAYLOAD_CHECKSUM_MISMATCH',
  'MALFORMED_JSON_PAYLOAD',
  'PAYLOAD_FORMAT_MISMATCH',
  'DEVICE_IDENTITY_MISMATCH',
  'INVALID_TIMEZONE_CONTEXT',
  'CANONICAL_VALIDATION_FAILED',
  'INVALID_TIMESTAMP',
  'TIMEZONE_CONTEXT_REQUIRED',
  'MISSING_TEMPERATURE',
  'INVALID_TEMPERATURE',
  'DUPLICATE_RECORD',
  'CONFLICTING_RECORD',
  'OUT_OF_ORDER_RECORD',
  'MISSING_INTERVAL',
  'UNKNOWN_DEVICE_FORMAT',
]);
export type LoggerDataQualityCode = z.infer<typeof LoggerDataQualityCode>;

export const LoggerMeasurementQualityFlag = z.enum([
  'DUPLICATE_RECORD',
  'OUT_OF_ORDER_RECORD',
]);
export type LoggerMeasurementQualityFlag = z.infer<typeof LoggerMeasurementQualityFlag>;

export const LoggerTimezoneResolutionOrigin = z.enum([
  'PAYLOAD_DECLARED',
  'DEVICE_CONTEXT',
  'NORMALIZATION_CONFIGURATION',
]);
export type LoggerTimezoneResolutionOrigin = z.infer<
  typeof LoggerTimezoneResolutionOrigin
>;

const timezoneOffset = z.string().refine((value) => {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(value);
  return match !== null && Number(match[2]) <= 23 && Number(match[3]) <= 59;
}, 'Expected a valid numeric timezone offset');

export const LoggerTimezoneResolutionSchema = z
  .object({
    original_timestamp: nonEmptyText,
    applied_offset: timezoneOffset,
    origin: LoggerTimezoneResolutionOrigin,
  })
  .strict();
export type LoggerTimezoneResolution = z.infer<typeof LoggerTimezoneResolutionSchema>;

export const LoggerAPayloadSchema = z
  .object({
    device_id: nonEmptyText,
    recorded_at: z.string().datetime({ offset: true }),
    temperature: z.number().finite(),
    humidity: z.number().finite().min(0).max(100),
    battery: z.number().int().min(0).max(100),
  })
  .strict();
export type LoggerAPayload = z.infer<typeof LoggerAPayloadSchema>;

const LOGGER_B_TIMESTAMP = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidLoggerBLocalTimestamp(value: string): boolean {
  const match = LOGGER_B_TIMESTAMP.exec(value);
  if (!match) return false;
  const [, dayText, monthText, yearText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const daysPerMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysPerMonth[month - 1] &&
    Number(hourText) <= 23 &&
    Number(minuteText) <= 59 &&
    Number(secondText) <= 59
  );
}

const finiteNumericText = z.string().refine(
  (value) => value.trim() !== '' && Number.isFinite(Number(value)),
  'Expected a finite numeric string',
);

export const LoggerBPayloadSchema = z
  .object({
    serial: nonEmptyText,
    timestamp: z.string().refine(isValidLoggerBLocalTimestamp, 'Expected DD/MM/YYYY HH:mm:ss'),
    temp_c: finiteNumericText,
    rh_percent: finiteNumericText,
  })
  .strict();
export type LoggerBPayload = z.infer<typeof LoggerBPayloadSchema>;

export const LoggerAEventSchema = z
  .object({
    source_type: LoggerSourceType,
    source_format: z.literal('LOGGER_A'),
    origin: z.literal(MeasurementOriginSchema.enum.SYNTHETIC),
    timestamp_semantics: z.literal('OFFSET_DECLARED_IN_PAYLOAD'),
    payload: LoggerAPayloadSchema,
  })
  .strict();
export type LoggerAEvent = z.infer<typeof LoggerAEventSchema>;

export const LoggerBEventSchema = z
  .object({
    source_type: LoggerSourceType,
    source_format: z.literal('LOGGER_B'),
    origin: z.literal(MeasurementOriginSchema.enum.SYNTHETIC),
    format_origin: z.literal('VENDOR_INSPIRED'),
    timestamp_semantics: z.literal('SOURCE_LOCAL_TIMEZONE_UNSPECIFIED'),
    payload: LoggerBPayloadSchema,
  })
  .strict();
export type LoggerBEvent = z.infer<typeof LoggerBEventSchema>;

export const LoggerEventSchema = z.discriminatedUnion('source_format', [
  LoggerAEventSchema,
  LoggerBEventSchema,
]);
export type LoggerEvent = z.infer<typeof LoggerEventSchema>;

export const RawIngestRecordSchema = z
  .object({
    ingest_id: nonEmptyText,
    received_at: z.string().datetime({ offset: true }),
    source_type: LoggerSourceType,
    source_format: LoggerSourceFormat,
    origin: z.literal(MeasurementOriginSchema.enum.SYNTHETIC),
    external_device_id: nonEmptyText.optional(),
    original_payload: z.string(),
    content_checksum_sha256: checksumSha256,
    ingestion_metadata: z
      .object({
        transport: z.literal('HTTP_JSON'),
        content_type: z.literal('application/json'),
        payload_encoding: z.literal('UTF-8'),
        request_ref: nonEmptyText.optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const actualChecksum = createHash('sha256')
      .update(value.original_payload, 'utf8')
      .digest('hex');
    if (actualChecksum !== value.content_checksum_sha256) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'content_checksum_sha256 does not match original_payload UTF-8 bytes',
        path: ['content_checksum_sha256'],
      });
    }
  });
export type RawIngestRecord = z.infer<typeof RawIngestRecordSchema>;

export const LoggerContractIssueSchema = z
  .object({
    code: LoggerDataQualityCode,
    message: nonEmptyText,
    field: nonEmptyText.optional(),
    raw_value: z.unknown().optional(),
  })
  .strict();
export type LoggerContractIssue = z.infer<typeof LoggerContractIssueSchema>;

export const LoggerParserResultSchema = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      raw_ingest_id: nonEmptyText,
      event: LoggerEventSchema,
      issues: z.array(LoggerContractIssueSchema),
    })
    .strict(),
  z
    .object({
      success: z.literal(false),
      raw_ingest_id: nonEmptyText,
      issues: z.array(LoggerContractIssueSchema).min(1),
    })
    .strict(),
]);
export type LoggerParserResult = z.infer<typeof LoggerParserResultSchema>;

export const LoggerNormalizationResultSchema = z
  .discriminatedUnion('success', [
    z
      .object({
        success: z.literal(true),
        raw_ingest_id: nonEmptyText,
        measurement: CanonicalTimeSeriesMeasurementSchema,
        timezone_resolution: LoggerTimezoneResolutionSchema,
        quality_flags: z.array(LoggerMeasurementQualityFlag),
        normalization_notes: z.array(nonEmptyText),
      })
      .strict(),
    z
      .object({
        success: z.literal(false),
        raw_ingest_id: nonEmptyText,
        issues: z.array(LoggerContractIssueSchema).min(1),
      })
      .strict(),
  ])
  .superRefine((value, context) => {
    if (
      value.success &&
      value.measurement.raw_ingest_id !== value.raw_ingest_id
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'measurement.raw_ingest_id must match raw_ingest_id',
        path: ['measurement', 'raw_ingest_id'],
      });
    }
  });
export type LoggerNormalizationResult = z.infer<typeof LoggerNormalizationResultSchema>;

export interface FileMetadata {
  fileName: string;
  dataset: string;
  checksumSha256: string;
  sourceFormat: string;
  measurementOrigin: MeasurementOrigin;
  mimeType?: string;
  sourceSensorId?: string;
}

export interface RawAsset {
  metadata: FileMetadata;
  content: Buffer;
}

export interface DetectionResult {
  supported: boolean;
  confidence: number;
  reason?: string;
}

export interface ParsedTimeSeriesRecord {
  recordType: Extract<RecordType, 'TIMESERIES'>;
  rawRef: string;
  timestampRaw: string;
  timestamp: string;
  temperatureRaw?: string;
  temperatureC?: number;
  humidityPct?: number;
  sourceMetadata: FileMetadata;
  warnings: string[];
}

export interface ParsedSpatialRecord {
  recordType: Extract<RecordType, 'SPATIAL_SNAPSHOT'>;
  rawRef: string;
  conditionId: string;
  positionX: number;
  positionY: number;
  positionZ?: number;
  temperatureRaw: string;
  temperatureC: number;
  sourceMetadata: FileMetadata;
  warnings: string[];
}

export type ParsedRecord = ParsedTimeSeriesRecord | ParsedSpatialRecord;

export interface ParserAdapter {
  id: string;
  version: string;
  canParse(input: FileMetadata, sample: Buffer): DetectionResult;
  parse(input: RawAsset): AsyncIterable<ParsedRecord>;
}
