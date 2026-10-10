import { createHash } from 'node:crypto';

import { CanonicalTimeSeriesMeasurementSchema } from '@coldproof/canonical-schema';
import {
  LoggerAEventSchema,
  LoggerBEventSchema,
  LoggerNormalizationResultSchema,
  LoggerTimezoneResolutionSchema,
} from '@coldproof/parser-contracts';
import type {
  LoggerContractIssue,
  LoggerNormalizationResult,
  LoggerSourceFormat,
  LoggerTimezoneResolutionOrigin,
  RawIngestRecord,
} from '@coldproof/parser-contracts';

export const LOGGER_NORMALIZER_VERSION = '1.0.0';
export const LOGGER_PARSER_IDS = {
  LOGGER_A: 'runtime-logger-a',
  LOGGER_B: 'runtime-logger-b',
} as const;

type ContextTimezoneOrigin = Extract<
  LoggerTimezoneResolutionOrigin,
  'DEVICE_CONTEXT' | 'NORMALIZATION_CONFIGURATION'
>;

export interface LoggerNormalizationContext {
  timezone?: {
    utc_offset: string;
    origin: ContextTimezoneOrigin;
  };
}

const LOGGER_B_LOCAL_TIMESTAMP =
  /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function failure(
  rawIngestId: string,
  issues: LoggerContractIssue[],
): LoggerNormalizationResult {
  return LoggerNormalizationResultSchema.parse({
    success: false,
    raw_ingest_id: rawIngestId,
    issues,
  });
}

function issue(
  code: LoggerContractIssue['code'],
  message: string,
  field?: string,
  rawValue?: unknown,
): LoggerContractIssue {
  return {
    code,
    message,
    ...(field !== undefined ? { field } : {}),
    ...(rawValue !== undefined ? { raw_value: rawValue } : {}),
  };
}

function loggerEventCandidate(format: 'LOGGER_A' | 'LOGGER_B', payload: unknown) {
  if (format === 'LOGGER_A') {
    return {
      source_type: 'SIMULATED_LOGGER',
      source_format: 'LOGGER_A',
      origin: 'SYNTHETIC',
      timestamp_semantics: 'OFFSET_DECLARED_IN_PAYLOAD',
      payload,
    };
  }
  return {
    source_type: 'SIMULATED_LOGGER',
    source_format: 'LOGGER_B',
    origin: 'SYNTHETIC',
    format_origin: 'VENDOR_INSPIRED',
    timestamp_semantics: 'SOURCE_LOCAL_TIMEZONE_UNSPECIFIED',
    payload,
  };
}

function matchesOppositeFormat(format: 'LOGGER_A' | 'LOGGER_B', payload: unknown): boolean {
  return format === 'LOGGER_A'
    ? LoggerBEventSchema.safeParse(loggerEventCandidate('LOGGER_B', payload)).success
    : LoggerAEventSchema.safeParse(loggerEventCandidate('LOGGER_A', payload)).success;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function payloadContractIssues(
  format: 'LOGGER_A' | 'LOGGER_B',
  payload: unknown,
  schemaIssues: ReadonlyArray<{ path: Array<string | number>; message: string }>,
): LoggerContractIssue[] {
  const temperatureField = format === 'LOGGER_A' ? 'temperature' : 'temp_c';
  const timestampField = format === 'LOGGER_A' ? 'recorded_at' : 'timestamp';
  const payloadRecord = isRecord(payload) ? payload : undefined;

  return schemaIssues.map((schemaIssue) => {
    const field = String(schemaIssue.path.at(-1) ?? 'payload');
    const rawValue = payloadRecord?.[field];
    if (field === temperatureField) {
      const missing = payloadRecord === undefined || !Object.hasOwn(payloadRecord, field);
      return issue(
        missing ? 'MISSING_TEMPERATURE' : 'INVALID_TEMPERATURE',
        missing
          ? `${temperatureField} is required for a physical measurement`
          : `${temperatureField} must contain a finite temperature`,
        temperatureField,
        rawValue,
      );
    }
    if (field === timestampField) {
      return issue(
        'INVALID_TIMESTAMP',
        `${timestampField} is not valid for ${format}`,
        timestampField,
        rawValue,
      );
    }
    return issue(
      'PAYLOAD_FORMAT_MISMATCH',
      `${format} payload contract violation: ${schemaIssue.message}`,
      field,
      rawValue,
    );
  });
}

function deterministicRecordId(
  raw: RawIngestRecord,
  parserId: string,
): string {
  const identity = JSON.stringify([
    raw.ingest_id,
    raw.content_checksum_sha256,
    parserId,
    LOGGER_NORMALIZER_VERSION,
  ]);
  return `rec_${sha256(identity)}`;
}

function payloadDeclaredOffset(timestamp: string): string {
  if (timestamp.endsWith('Z')) return '+00:00';
  return timestamp.slice(-6);
}

function resolveLoggerBTimestamp(timestamp: string, utcOffset: string): string {
  const match = LOGGER_B_LOCAL_TIMESTAMP.exec(timestamp);
  if (!match) return timestamp;
  const [, day, month, year, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${utcOffset}`;
}

function validateExternalDevice(
  raw: RawIngestRecord,
  payloadDeviceId: string,
): LoggerNormalizationResult | undefined {
  if (
    raw.external_device_id !== undefined &&
    raw.external_device_id !== payloadDeviceId
  ) {
    return failure(raw.ingest_id, [
      issue(
        'DEVICE_IDENTITY_MISMATCH',
        'Raw ingest external_device_id does not match the validated logger payload identity',
        'external_device_id',
        raw.external_device_id,
      ),
    ]);
  }
  return undefined;
}

function canonicalSuccess(input: {
  raw: RawIngestRecord;
  parserId: string;
  deviceId: string;
  timestamp: string;
  temperatureC: number;
  humidityPct: number;
  timezoneResolution: {
    original_timestamp: string;
    applied_offset: string;
    origin: LoggerTimezoneResolutionOrigin;
  };
  normalizationNotes: string[];
}): LoggerNormalizationResult {
  const candidate = {
    record_id: deterministicRecordId(input.raw, input.parserId),
    record_type: 'TIMESERIES' as const,
    raw_ingest_id: input.raw.ingest_id,
    timestamp: input.timestamp,
    temperature_c: input.temperatureC,
    humidity_pct: input.humidityPct,
    source_dataset: 'SIMULATED_LOGGER',
    source_file: `raw-ingest:${input.raw.ingest_id}`,
    source_sensor_id: input.deviceId,
    source_row_or_ref: 'payload',
    source_checksum_sha256: input.raw.content_checksum_sha256,
    source_format: input.raw.source_format,
    parser_id: input.parserId,
    parser_version: LOGGER_NORMALIZER_VERSION,
    measurement_origin: 'SYNTHETIC' as const,
    missing_flag: false,
    duplicate_flag: false,
    conflict_flag: false,
  };
  const canonical = CanonicalTimeSeriesMeasurementSchema.safeParse(candidate);
  if (!canonical.success) {
    return failure(input.raw.ingest_id, [
      issue(
        'CANONICAL_VALIDATION_FAILED',
        canonical.error.issues.map((item) => item.message).join('; '),
      ),
    ]);
  }

  return LoggerNormalizationResultSchema.parse({
    success: true,
    raw_ingest_id: input.raw.ingest_id,
    measurement: canonical.data,
    timezone_resolution: input.timezoneResolution,
    quality_flags: [],
    normalization_notes: input.normalizationNotes,
  });
}

/**
 * Pure single-record logger normalization. This function performs no I/O and
 * never mutates the preserved RawIngestRecord or its original payload text.
 */
export function normalizeLoggerIngest(
  raw: RawIngestRecord,
  context: LoggerNormalizationContext = {},
): LoggerNormalizationResult {
  const actualChecksum = sha256(raw.original_payload);
  if (actualChecksum !== raw.content_checksum_sha256) {
    return failure(raw.ingest_id, [
      issue(
        'RAW_PAYLOAD_CHECKSUM_MISMATCH',
        'content_checksum_sha256 does not match the exact original_payload UTF-8 bytes',
        'content_checksum_sha256',
        raw.content_checksum_sha256,
      ),
    ]);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw.original_payload) as unknown;
  } catch {
    return failure(raw.ingest_id, [
      issue(
        'MALFORMED_JSON_PAYLOAD',
        'original_payload is not valid JSON',
        'original_payload',
      ),
    ]);
  }

  if (raw.source_format === 'UNKNOWN') {
    return failure(raw.ingest_id, [
      issue(
        'UNKNOWN_DEVICE_FORMAT',
        'Raw ingest source_format is not a supported simulated logger format',
        'source_format',
        raw.source_format,
      ),
    ]);
  }

  const format = raw.source_format as Exclude<LoggerSourceFormat, 'UNKNOWN'>;
  const eventCandidate = loggerEventCandidate(format, payload);
  const validation =
    format === 'LOGGER_A'
      ? LoggerAEventSchema.safeParse(eventCandidate)
      : LoggerBEventSchema.safeParse(eventCandidate);

  if (!validation.success) {
    if (matchesOppositeFormat(format, payload)) {
      return failure(raw.ingest_id, [
        issue(
          'PAYLOAD_FORMAT_MISMATCH',
          `Declared source_format ${format} conflicts with the payload contract`,
          'source_format',
          format,
        ),
      ]);
    }
    return failure(
      raw.ingest_id,
      payloadContractIssues(format, payload, validation.error.issues),
    );
  }

  if (validation.data.source_format === 'LOGGER_A') {
    const event = validation.data;
    const deviceFailure = validateExternalDevice(raw, event.payload.device_id);
    if (deviceFailure) return deviceFailure;
    const appliedOffset = payloadDeclaredOffset(event.payload.recorded_at);
    const timezoneResolution = LoggerTimezoneResolutionSchema.parse({
      original_timestamp: event.payload.recorded_at,
      applied_offset: appliedOffset,
      origin: 'PAYLOAD_DECLARED',
    });
    return canonicalSuccess({
      raw,
      parserId: LOGGER_PARSER_IDS.LOGGER_A,
      deviceId: event.payload.device_id,
      timestamp: event.payload.recorded_at,
      temperatureC: event.payload.temperature,
      humidityPct: event.payload.humidity,
      timezoneResolution,
      normalizationNotes: [
        'LOGGER_A battery remains available only in the preserved raw payload.',
      ],
    });
  }

  const event = validation.data;
  const deviceFailure = validateExternalDevice(raw, event.payload.serial);
  if (deviceFailure) return deviceFailure;
  if (context.timezone === undefined) {
    return failure(raw.ingest_id, [
      issue(
        'TIMEZONE_CONTEXT_REQUIRED',
        'LOGGER_B requires explicit device or normalization timezone context',
        'timestamp',
        event.payload.timestamp,
      ),
    ]);
  }

  const timezoneResolution = LoggerTimezoneResolutionSchema.safeParse({
    original_timestamp: event.payload.timestamp,
    applied_offset: context.timezone.utc_offset,
    origin: context.timezone.origin,
  });
  if (!timezoneResolution.success) {
    return failure(raw.ingest_id, [
      issue(
        'INVALID_TIMEZONE_CONTEXT',
        timezoneResolution.error.issues.map((item) => item.message).join('; '),
        'timezone',
        context.timezone,
      ),
    ]);
  }

  return canonicalSuccess({
    raw,
    parserId: LOGGER_PARSER_IDS.LOGGER_B,
    deviceId: event.payload.serial,
    timestamp: resolveLoggerBTimestamp(
      event.payload.timestamp,
      timezoneResolution.data.applied_offset,
    ),
    temperatureC: Number(event.payload.temp_c),
    humidityPct: Number(event.payload.rh_percent),
    timezoneResolution: timezoneResolution.data,
    normalizationNotes: [],
  });
}
