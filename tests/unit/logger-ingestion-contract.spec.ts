import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { CanonicalTimeSeriesMeasurementSchema } from '@coldproof/canonical-schema';
import {
  LoggerAEventSchema,
  LoggerBEventSchema,
  LoggerDataQualityCode,
  LoggerNormalizationResultSchema,
  LoggerParserResultSchema,
  RawIngestRecordSchema,
} from '@coldproof/parser-contracts';

const fixtureDirectory = path.join(process.cwd(), 'tests/fixtures/logger');
const loggerARaw = readFileSync(path.join(fixtureDirectory, 'logger-a.json'), 'utf8');
const loggerBRaw = readFileSync(path.join(fixtureDirectory, 'logger-b.json'), 'utf8');

function checksum(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('Logger Ingestion Contract v1', () => {
  it('accepts a valid synthetic LOGGER_A event with a payload-declared offset', () => {
    const payload = JSON.parse(loggerARaw) as unknown;
    const result = LoggerAEventSchema.safeParse({
      source_type: 'SIMULATED_LOGGER',
      source_format: 'LOGGER_A',
      origin: 'SYNTHETIC',
      timestamp_semantics: 'OFFSET_DECLARED_IN_PAYLOAD',
      payload,
    });

    expect(result.success).toBe(true);
  });

  it('accepts a valid vendor-inspired LOGGER_B event without inventing timezone data', () => {
    const payload = JSON.parse(loggerBRaw) as { timestamp: string };
    const result = LoggerBEventSchema.parse({
      source_type: 'SIMULATED_LOGGER',
      source_format: 'LOGGER_B',
      origin: 'SYNTHETIC',
      format_origin: 'VENDOR_INSPIRED',
      timestamp_semantics: 'SOURCE_LOCAL_TIMEZONE_UNSPECIFIED',
      payload,
    });

    expect(result.payload.timestamp).toBe('10/10/2026 14:30:00');
    expect(result.payload.timestamp).not.toMatch(/Z|[+-]\d{2}:\d{2}$/);
    expect(result.timestamp_semantics).toBe('SOURCE_LOCAL_TIMEZONE_UNSPECIFIED');
  });

  it('preserves the exact original logger payload text in the raw ingest record', () => {
    const result = RawIngestRecordSchema.parse({
      ingest_id: 'ingest_logger_a_001',
      received_at: '2026-10-10T14:30:01+07:00',
      source_type: 'SIMULATED_LOGGER',
      source_format: 'LOGGER_A',
      origin: 'SYNTHETIC',
      external_device_id: 'LOGGER-A-001',
      original_payload: loggerARaw,
      content_checksum_sha256: checksum(loggerARaw),
      ingestion_metadata: {
        transport: 'HTTP_JSON',
        content_type: 'application/json',
        payload_encoding: 'UTF-8',
        request_ref: 'request:test:001',
      },
    });

    expect(result.original_payload).toBe(loggerARaw);
    expect(result.content_checksum_sha256).toBe(checksum(loggerARaw));
  });

  it('rejects a content checksum that does not identify the exact raw payload', () => {
    const result = RawIngestRecordSchema.safeParse({
      ingest_id: 'ingest_checksum_mismatch',
      received_at: '2026-10-10T14:30:01+07:00',
      source_type: 'SIMULATED_LOGGER',
      source_format: 'LOGGER_A',
      origin: 'SYNTHETIC',
      external_device_id: 'LOGGER-A-001',
      original_payload: loggerARaw,
      content_checksum_sha256: '0'.repeat(64),
      ingestion_metadata: {
        transport: 'HTTP_JSON',
        content_type: 'application/json',
        payload_encoding: 'UTF-8',
      },
    });

    expect(result.success).toBe(false);
  });

  it('links a normalized canonical measurement back to its raw ingest record', () => {
    const measurement = CanonicalTimeSeriesMeasurementSchema.parse({
      record_id: 'rec_logger_a_001',
      record_type: 'TIMESERIES',
      raw_ingest_id: 'ingest_logger_a_001',
      timestamp: '2026-10-10T14:30:00+07:00',
      temperature_c: 5.4,
      humidity_pct: 72.1,
      source_dataset: 'SIMULATED_LOGGER',
      source_file: 'raw-ingest:ingest_logger_a_001',
      source_sensor_id: 'LOGGER-A-001',
      source_row_or_ref: 'payload',
      source_checksum_sha256: checksum(loggerARaw),
      source_format: 'LOGGER_A',
      parser_id: 'logger-a-parser',
      parser_version: '1.0.0',
      measurement_origin: 'SYNTHETIC',
      missing_flag: false,
      duplicate_flag: false,
      conflict_flag: false,
    });
    const result = LoggerNormalizationResultSchema.safeParse({
      success: true,
      raw_ingest_id: 'ingest_logger_a_001',
      measurement,
      timezone_resolution: {
        original_timestamp: '2026-10-10T14:30:00+07:00',
        applied_offset: '+07:00',
        origin: 'PAYLOAD_DECLARED',
      },
      quality_flags: [],
      normalization_notes: [],
    });

    expect(result.success).toBe(true);
    if (result.success && result.data.success) {
      expect(result.data.measurement.raw_ingest_id).toBe(result.data.raw_ingest_id);
      expect(result.data.measurement.source_sensor_id).toBe('LOGGER-A-001');
    }
  });

  it('represents an invalid timestamp without fabricating a canonical timestamp', () => {
    const result = LoggerParserResultSchema.parse({
      success: false,
      raw_ingest_id: 'ingest_invalid_timestamp',
      issues: [
        {
          code: 'INVALID_TIMESTAMP',
          field: 'recorded_at',
          raw_value: 'not-a-timestamp',
          message: 'recorded_at is not a valid offset-bearing timestamp',
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.issues[0].code).toBe('INVALID_TIMESTAMP');
  });

  it('represents LOGGER_B timezone ambiguity as a normalization failure', () => {
    const result = LoggerNormalizationResultSchema.parse({
      success: false,
      raw_ingest_id: 'ingest_logger_b_001',
      issues: [
        {
          code: 'TIMEZONE_CONTEXT_REQUIRED',
          field: 'timestamp',
          raw_value: '10/10/2026 14:30:00',
          message: 'LOGGER_B requires explicit device or normalization timezone context',
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0].code).toBe('TIMEZONE_CONTEXT_REQUIRED');
    }
  });

  it('rejects a normalization success whose raw provenance IDs disagree', () => {
    const result = LoggerNormalizationResultSchema.safeParse({
      success: true,
      raw_ingest_id: 'ingest_envelope',
      measurement: {
        record_id: 'rec_mismatch',
        record_type: 'TIMESERIES',
        raw_ingest_id: 'ingest_measurement',
        timestamp: '2026-10-10T14:30:00+07:00',
        temperature_c: 5.4,
        source_dataset: 'SIMULATED_LOGGER',
        source_file: 'raw-ingest:ingest_measurement',
        source_sensor_id: 'LOGGER-A-001',
        source_row_or_ref: 'payload',
        source_checksum_sha256: checksum(loggerARaw),
        source_format: 'LOGGER_A',
        parser_id: 'logger-a-parser',
        parser_version: '1.0.0',
        measurement_origin: 'SYNTHETIC',
        missing_flag: false,
        duplicate_flag: false,
        conflict_flag: false,
      },
      timezone_resolution: {
        original_timestamp: '2026-10-10T14:30:00+07:00',
        applied_offset: '+07:00',
        origin: 'PAYLOAD_DECLARED',
      },
      quality_flags: [],
      normalization_notes: [],
    });

    expect(result.success).toBe(false);
  });

  it('represents a missing temperature while preserving the raw ingest reference', () => {
    const result = LoggerParserResultSchema.parse({
      success: false,
      raw_ingest_id: 'ingest_missing_temperature',
      issues: [
        {
          code: 'MISSING_TEMPERATURE',
          field: 'temperature',
          message: 'temperature is required for a physical measurement',
        },
      ],
    });

    expect(result.raw_ingest_id).toBe('ingest_missing_temperature');
    expect(result.issues[0].code).toBe('MISSING_TEMPERATURE');
  });

  it('preserves unknown input and represents an unknown device format', () => {
    const raw = RawIngestRecordSchema.parse({
      ingest_id: 'ingest_unknown_001',
      received_at: '2026-10-10T14:30:01+07:00',
      source_type: 'SIMULATED_LOGGER',
      source_format: 'UNKNOWN',
      origin: 'SYNTHETIC',
      original_payload: '{"unexpected":true}',
      content_checksum_sha256: checksum('{"unexpected":true}'),
      ingestion_metadata: {
        transport: 'HTTP_JSON',
        content_type: 'application/json',
        payload_encoding: 'UTF-8',
      },
    });
    const result = LoggerParserResultSchema.parse({
      success: false,
      raw_ingest_id: raw.ingest_id,
      issues: [
        {
          code: 'UNKNOWN_DEVICE_FORMAT',
          message: 'Payload does not match a supported simulated logger format',
        },
      ],
    });

    expect(raw.original_payload).toBe('{"unexpected":true}');
    expect(result.issues[0].code).toBe('UNKNOWN_DEVICE_FORMAT');
  });

  it('exposes every Logger Ingestion v1 data-quality outcome', () => {
    expect(LoggerDataQualityCode.options).toEqual([
      'INVALID_TIMESTAMP',
      'TIMEZONE_CONTEXT_REQUIRED',
      'MISSING_TEMPERATURE',
      'INVALID_TEMPERATURE',
      'DUPLICATE_RECORD',
      'OUT_OF_ORDER_RECORD',
      'UNKNOWN_DEVICE_FORMAT',
    ]);
  });
});
