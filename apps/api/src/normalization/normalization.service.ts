import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { CanonicalTimeSeriesMeasurementSchema } from '@coldproof/canonical-schema';
import type { ParsedTimeSeriesRecord } from '@coldproof/parser-contracts';
import type { ScaffoldStatus } from '@coldproof/shared-types';

import type {
  AppliedNormalizationContext,
  NormalizationContext,
  NormalizationError,
  NormalizationResult,
  TimezoneOrigin,
} from './normalization.types';

const LOCAL_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;
const NUMERIC_TIMEZONE_OFFSET = /^([+-])(\d{2}):(\d{2})$/;
const TIMEZONE_ORIGINS: readonly TimezoneOrigin[] = ['SOURCE_DECLARED', 'EXPLICIT_ASSUMPTION'];

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidLocalTimestamp(timestamp: string): boolean {
  const match = LOCAL_TIMESTAMP.exec(timestamp);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const daysPerMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysPerMonth[month - 1] &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59
  );
}

function isValidTimezoneOffset(offset: string): boolean {
  const match = NUMERIC_TIMEZONE_OFFSET.exec(offset);
  if (!match) return false;

  const [, , hourText, minuteText] = match;
  return Number(hourText) <= 23 && Number(minuteText) <= 59;
}

function isTimezoneOrigin(value: string | undefined): value is TimezoneOrigin {
  return value !== undefined && TIMEZONE_ORIGINS.includes(value as TimezoneOrigin);
}

function deterministicRecordId(
  sourceChecksum: string,
  rawRef: string,
  parserId: string,
  parserVersion: string,
): string {
  const identity = JSON.stringify([sourceChecksum, rawRef, parserId, parserVersion]);
  return `rec_${createHash('sha256').update(identity, 'utf8').digest('hex')}`;
}

@Injectable()
export class NormalizationService {
  status(): ScaffoldStatus {
    return {
      module: 'normalization',
      status: 'TODO',
      message: 'Time-series normalization is available; import orchestration remains TODO.',
    };
  }

  normalizeTimeSeries(
    record: ParsedTimeSeriesRecord,
    context: NormalizationContext,
  ): NormalizationResult {
    const errors: NormalizationError[] = [];
    const parserId = context.parserId.trim();
    const parserVersion = context.parserVersion.trim();

    if (record.recordType !== 'TIMESERIES') {
      errors.push({
        code: 'INVALID_RECORD_TYPE',
        field: 'recordType',
        message: `Expected TIMESERIES but received ${String(record.recordType)}`,
      });
    }

    if (parserId === '' || parserVersion === '') {
      errors.push({
        code: 'INVALID_PARSER_IDENTITY',
        field: parserId === '' ? 'parserId' : 'parserVersion',
        message: 'parserId and parserVersion must both be non-empty',
      });
    }

    if (context.timezoneOffset === undefined || context.timezoneOrigin === undefined) {
      errors.push({
        code: 'MISSING_TIMEZONE_CONTEXT',
        field: context.timezoneOffset === undefined ? 'timezoneOffset' : 'timezoneOrigin',
        message: 'Explicit timezoneOffset and timezoneOrigin are required for normalization',
      });
    } else {
      if (!isValidTimezoneOffset(context.timezoneOffset)) {
        errors.push({
          code: 'INVALID_TIMEZONE_OFFSET',
          field: 'timezoneOffset',
          message: `Invalid numeric timezone offset: ${context.timezoneOffset}`,
        });
      }
      if (!isTimezoneOrigin(context.timezoneOrigin)) {
        errors.push({
          code: 'INVALID_TIMEZONE_ORIGIN',
          field: 'timezoneOrigin',
          message: `Unsupported timezone origin: ${String(context.timezoneOrigin)}`,
        });
      }
    }

    if (!isValidLocalTimestamp(record.timestamp)) {
      errors.push({
        code: 'INVALID_PARSED_TIMESTAMP',
        field: 'timestamp',
        message: `Expected local timestamp YYYY-MM-DDTHH:mm:ss but received ${record.timestamp}`,
      });
    }

    if (record.temperatureC === undefined || !Number.isFinite(record.temperatureC)) {
      errors.push({
        code: 'INVALID_TEMPERATURE',
        field: 'temperatureC',
        message: 'A finite temperatureC is required for an emitted physical measurement',
      });
    }

    if (record.humidityPct !== undefined && !Number.isFinite(record.humidityPct)) {
      errors.push({
        code: 'INVALID_HUMIDITY',
        field: 'humidityPct',
        message: 'humidityPct must be finite when present',
      });
    }

    if (
      record.sourceMetadata.sourceSensorId === undefined ||
      record.sourceMetadata.sourceSensorId.trim() === ''
    ) {
      errors.push({
        code: 'MISSING_SOURCE_SENSOR_ID',
        field: 'sourceMetadata.sourceSensorId',
        message: 'sourceSensorId is required by the canonical time-series contract',
      });
    }

    for (const warning of record.warnings) {
      errors.push({
        code: 'PARSER_WARNING',
        field: 'warnings',
        message: `Parsed record contains warning: ${warning}`,
        parserWarning: warning,
      });
    }

    if (errors.length > 0) return { success: false, errors };

    const timezoneOffset = context.timezoneOffset as string;
    const timezoneOrigin = context.timezoneOrigin as TimezoneOrigin;
    const sourceSensorId = record.sourceMetadata.sourceSensorId as string;
    const candidate = {
      record_id: deterministicRecordId(
        record.sourceMetadata.checksumSha256,
        record.rawRef,
        parserId,
        parserVersion,
      ),
      record_type: 'TIMESERIES' as const,
      timestamp: `${record.timestamp}${timezoneOffset}`,
      temperature_c: record.temperatureC,
      ...(record.humidityPct !== undefined ? { humidity_pct: record.humidityPct } : {}),
      source_dataset: record.sourceMetadata.dataset,
      source_file: record.sourceMetadata.fileName,
      source_sensor_id: sourceSensorId,
      source_row_or_ref: record.rawRef,
      source_checksum_sha256: record.sourceMetadata.checksumSha256,
      source_format: record.sourceMetadata.sourceFormat,
      parser_id: parserId,
      parser_version: parserVersion,
      measurement_origin: record.sourceMetadata.measurementOrigin,
      missing_flag: false,
      duplicate_flag: false,
      conflict_flag: false,
    };
    const validation = CanonicalTimeSeriesMeasurementSchema.safeParse(candidate);

    if (!validation.success) {
      return {
        success: false,
        errors: validation.error.issues.map((issue) => ({
          code: 'CANONICAL_VALIDATION_FAILED',
          field: issue.path.join('.'),
          message: issue.message,
        })),
      };
    }

    const appliedContext: AppliedNormalizationContext = {
      parserId,
      parserVersion,
      timezoneOffset,
      timezoneOrigin,
    };

    return { success: true, measurement: validation.data, appliedContext };
  }
}
