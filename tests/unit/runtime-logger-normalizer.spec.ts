import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { CanonicalTimeSeriesMeasurementSchema } from '@coldproof/canonical-schema';
import {
  LOGGER_NORMALIZER_VERSION,
  LOGGER_PARSER_IDS,
  normalizeLoggerIngest,
} from '@coldproof/logger-normalizer';
import {
  LoggerNormalizationResultSchema,
  RawIngestRecordSchema,
} from '@coldproof/parser-contracts';
import type {
  LoggerNormalizationResult,
  LoggerSourceFormat,
  RawIngestRecord,
} from '@coldproof/parser-contracts';

import {
  generateLoggerEvents,
  type LoggerSchemas,
  type SimulatorConfig,
} from '../../scripts/simulated-logger-core.cjs';
import { LoggerAEventSchema, LoggerBEventSchema } from '@coldproof/parser-contracts';

const fixtureDirectory = path.join(process.cwd(), 'tests/fixtures/logger');
const loggerARaw = readFileSync(path.join(fixtureDirectory, 'logger-a.json'), 'utf8');
const loggerBRaw = readFileSync(path.join(fixtureDirectory, 'logger-b.json'), 'utf8');

function checksum(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function rawIngest(
  originalPayload: string,
  sourceFormat: LoggerSourceFormat,
  externalDeviceId?: string,
  ingestId = `ingest_${sourceFormat.toLowerCase()}_001`,
): RawIngestRecord {
  return RawIngestRecordSchema.parse({
    ingest_id: ingestId,
    received_at: '2026-10-10T14:30:01+07:00',
    source_type: 'SIMULATED_LOGGER',
    source_format: sourceFormat,
    origin: 'SYNTHETIC',
    ...(externalDeviceId !== undefined
      ? { external_device_id: externalDeviceId }
      : {}),
    original_payload: originalPayload,
    content_checksum_sha256: checksum(originalPayload),
    ingestion_metadata: {
      transport: 'HTTP_JSON',
      content_type: 'application/json',
      payload_encoding: 'UTF-8',
    },
  });
}

function requireSuccess(result: LoggerNormalizationResult) {
  if (!result.success) throw new Error(JSON.stringify(result.issues));
  return result;
}

function issueCodes(result: LoggerNormalizationResult): string[] {
  return result.success ? [] : result.issues.map((item) => item.code);
}

describe('Runtime Logger Normalizer v1', () => {
  it('normalizes LOGGER_A into a canonical measurement with raw provenance', () => {
    const raw = rawIngest(loggerARaw, 'LOGGER_A', 'LOGGER-A-001');
    const result = requireSuccess(normalizeLoggerIngest(raw));

    expect(result.measurement).toMatchObject({
      record_type: 'TIMESERIES',
      raw_ingest_id: raw.ingest_id,
      timestamp: '2026-10-10T14:30:00+07:00',
      temperature_c: 5.4,
      humidity_pct: 72.1,
      source_dataset: 'SIMULATED_LOGGER',
      source_file: `raw-ingest:${raw.ingest_id}`,
      source_sensor_id: 'LOGGER-A-001',
      source_row_or_ref: 'payload',
      source_checksum_sha256: raw.content_checksum_sha256,
      source_format: 'LOGGER_A',
      parser_id: LOGGER_PARSER_IDS.LOGGER_A,
      parser_version: LOGGER_NORMALIZER_VERSION,
      measurement_origin: 'SYNTHETIC',
      missing_flag: false,
      duplicate_flag: false,
      conflict_flag: false,
    });
    expect(CanonicalTimeSeriesMeasurementSchema.safeParse(result.measurement).success).toBe(true);
    expect(LoggerNormalizationResultSchema.safeParse(result).success).toBe(true);
  });

  it('records LOGGER_A timezone provenance as payload declared', () => {
    const result = requireSuccess(
      normalizeLoggerIngest(rawIngest(loggerARaw, 'LOGGER_A', 'LOGGER-A-001')),
    );

    expect(result.timezone_resolution).toEqual({
      original_timestamp: '2026-10-10T14:30:00+07:00',
      applied_offset: '+07:00',
      origin: 'PAYLOAD_DECLARED',
    });
  });

  it('requires explicit timezone context for LOGGER_B', () => {
    const result = normalizeLoggerIngest(rawIngest(loggerBRaw, 'LOGGER_B', 'B-0001'));

    expect(issueCodes(result)).toContain('TIMEZONE_CONTEXT_REQUIRED');
  });

  it('normalizes LOGGER_B with explicit context-supplied timezone provenance', () => {
    const result = requireSuccess(
      normalizeLoggerIngest(rawIngest(loggerBRaw, 'LOGGER_B', 'B-0001'), {
        timezone: {
          utc_offset: '+07:00',
          origin: 'DEVICE_CONTEXT',
        },
      }),
    );

    expect(result.measurement).toMatchObject({
      timestamp: '2026-10-10T14:30:00+07:00',
      temperature_c: 5.4,
      humidity_pct: 72.1,
      source_sensor_id: 'B-0001',
      source_format: 'LOGGER_B',
      parser_id: LOGGER_PARSER_IDS.LOGGER_B,
    });
    expect(result.timezone_resolution).toEqual({
      original_timestamp: '10/10/2026 14:30:00',
      applied_offset: '+07:00',
      origin: 'DEVICE_CONTEXT',
    });
    expect(result.timezone_resolution.origin).not.toBe('PAYLOAD_DECLARED');
  });

  it('returns a structured failure for malformed JSON', () => {
    const result = normalizeLoggerIngest(
      rawIngest('{"temperature":', 'LOGGER_A', 'LOGGER-A-001'),
    );

    expect(issueCodes(result)).toEqual(['MALFORMED_JSON_PAYLOAD']);
  });

  it('fails raw integrity validation before JSON parsing', () => {
    const valid = rawIngest('{"temperature":', 'LOGGER_A', 'LOGGER-A-001');
    const invalid = {
      ...valid,
      content_checksum_sha256: '0'.repeat(64),
    } as RawIngestRecord;
    const result = normalizeLoggerIngest(invalid);

    expect(issueCodes(result)).toEqual(['RAW_PAYLOAD_CHECKSUM_MISMATCH']);
  });

  it('returns INVALID_TIMESTAMP for a payload timestamp contract violation', () => {
    const payload = JSON.stringify({
      ...JSON.parse(loggerARaw),
      recorded_at: '2026-10-10T14:30:00',
    });
    const result = normalizeLoggerIngest(
      rawIngest(payload, 'LOGGER_A', 'LOGGER-A-001'),
    );

    expect(issueCodes(result)).toContain('INVALID_TIMESTAMP');
  });

  it('rejects an unknown declared source format without guessing from fields', () => {
    const result = normalizeLoggerIngest(
      rawIngest(loggerARaw, 'UNKNOWN', 'LOGGER-A-001'),
    );

    expect(issueCodes(result)).toEqual(['UNKNOWN_DEVICE_FORMAT']);
  });

  it('rejects a LOGGER_A payload declared as LOGGER_B', () => {
    const result = normalizeLoggerIngest(
      rawIngest(loggerARaw, 'LOGGER_B', 'LOGGER-A-001'),
      { timezone: { utc_offset: '+07:00', origin: 'DEVICE_CONTEXT' } },
    );

    expect(issueCodes(result)).toEqual(['PAYLOAD_FORMAT_MISMATCH']);
  });

  it('distinguishes invalid and missing LOGGER_B temperature', () => {
    const invalidPayload = JSON.stringify({
      ...JSON.parse(loggerBRaw),
      temp_c: 'abc',
    });
    const missingObject = JSON.parse(loggerBRaw) as Record<string, unknown>;
    delete missingObject.temp_c;

    expect(
      issueCodes(normalizeLoggerIngest(rawIngest(invalidPayload, 'LOGGER_B', 'B-0001'))),
    ).toContain('INVALID_TEMPERATURE');
    expect(
      issueCodes(
        normalizeLoggerIngest(
          rawIngest(JSON.stringify(missingObject), 'LOGGER_B', 'B-0001'),
        ),
      ),
    ).toContain('MISSING_TEMPERATURE');
  });

  it('rejects conflicting envelope and payload device identities', () => {
    const result = normalizeLoggerIngest(
      rawIngest(loggerARaw, 'LOGGER_A', 'LOGGER-A-DIFFERENT'),
    );

    expect(issueCodes(result)).toEqual(['DEVICE_IDENTITY_MISMATCH']);
  });

  it('does not mutate the exact original payload string or raw envelope', () => {
    const raw = rawIngest(loggerARaw, 'LOGGER_A', 'LOGGER-A-001');
    const before = structuredClone(raw);

    normalizeLoggerIngest(raw);

    expect(raw).toEqual(before);
    expect(raw.original_payload).toBe(loggerARaw);
  });

  it('produces deterministic canonical output with explicit parser identity', () => {
    const raw = rawIngest(loggerARaw, 'LOGGER_A', 'LOGGER-A-001');
    const first = requireSuccess(normalizeLoggerIngest(raw));
    const second = requireSuccess(normalizeLoggerIngest(raw));

    expect(second).toEqual(first);
    expect(first.measurement.record_id).toMatch(/^rec_[a-f0-9]{64}$/);
    expect(first.measurement.parser_id).toBe(LOGGER_PARSER_IDS.LOGGER_A);
    expect(first.measurement.parser_version).toBe(LOGGER_NORMALIZER_VERSION);
    expect(first.measurement.raw_ingest_id).toBe(raw.ingest_id);
  });

  it('rejects invalid timezone context rather than inventing an offset', () => {
    const result = normalizeLoggerIngest(
      rawIngest(loggerBRaw, 'LOGGER_B', 'B-0001'),
      {
        timezone: {
          utc_offset: '+25:00',
          origin: 'NORMALIZATION_CONFIGURATION',
        },
      },
    );

    expect(issueCodes(result)).toEqual(['INVALID_TIMEZONE_CONTEXT']);
  });
});

describe('Simulated logger to canonical round trip', () => {
  const schemas: LoggerSchemas = {
    LOGGER_A: LoggerAEventSchema,
    LOGGER_B: LoggerBEventSchema,
  };

  function simulatorConfig(format: 'LOGGER_A' | 'LOGGER_B'): SimulatorConfig {
    return {
      help: false,
      format,
      deviceId: format === 'LOGGER_A' ? 'LOGGER-A-ROUNDTRIP' : 'B-ROUNDTRIP',
      count: 1,
      seed: 42,
      startTime:
        format === 'LOGGER_A'
          ? '2026-10-10T14:30:00+07:00'
          : '2026-10-10T14:30:00',
      cadenceMs: 5_000,
      intervalMs: 0,
      dryRun: true,
    };
  }

  it.each(['LOGGER_A', 'LOGGER_B'] as const)(
    'normalizes a generated %s payload through the raw ingest boundary',
    (format) => {
      const event = generateLoggerEvents(simulatorConfig(format), schemas)[0];
      const payload = JSON.stringify(event.payload);
      const deviceId =
        event.source_format === 'LOGGER_A'
          ? event.payload.device_id
          : event.payload.serial;
      const raw = rawIngest(payload, format, deviceId, `ingest_roundtrip_${format}`);
      const result = requireSuccess(
        normalizeLoggerIngest(
          raw,
          format === 'LOGGER_B'
            ? {
                timezone: {
                  utc_offset: '+07:00',
                  origin: 'NORMALIZATION_CONFIGURATION',
                },
              }
            : undefined,
        ),
      );

      expect(result.measurement.raw_ingest_id).toBe(raw.ingest_id);
      expect(result.measurement.source_sensor_id).toBe(deviceId);
      expect(result.measurement.source_checksum_sha256).toBe(checksum(payload));
      expect(result.measurement.measurement_origin).toBe('SYNTHETIC');
    },
  );
});
