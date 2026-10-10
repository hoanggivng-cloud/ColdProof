import { createHash } from 'node:crypto';

import type { CanonicalTimeSeriesMeasurement } from '@coldproof/canonical-schema';
import type { LoggerNormalizationContext } from '@coldproof/logger-normalizer';
import type {
  LoggerAEvent,
  LoggerBEvent,
  LoggerSourceFormat,
  RawIngestRecord,
} from '@coldproof/parser-contracts';
import {
  LoggerAEventSchema,
  LoggerBEventSchema,
  RawIngestRecordSchema,
} from '@coldproof/parser-contracts';
import {
  assessProcessedSequence,
  processLoggerIngest,
  RUNTIME_DATA_PIPELINE_VERSION,
  type RuntimeProcessingResult,
} from '@coldproof/runtime-data-pipeline';

import {
  generateLoggerEvents,
  type LoggerSchemas,
  type SimulatorConfig,
} from '../../scripts/simulated-logger-core.cjs';

const schemas: LoggerSchemas = {
  LOGGER_A: LoggerAEventSchema,
  LOGGER_B: LoggerBEventSchema,
};

const loggerBTimezone: LoggerNormalizationContext = {
  timezone: {
    utc_offset: '+07:00',
    origin: 'DEVICE_CONTEXT',
  },
};

function checksum(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function simulatorConfig(
  format: 'LOGGER_A' | 'LOGGER_B',
  overrides: Partial<SimulatorConfig> = {},
): SimulatorConfig {
  return {
    help: false,
    format,
    deviceId: format === 'LOGGER_A' ? 'LOGGER-A-001' : 'B-0001',
    count: 3,
    seed: 42,
    startTime:
      format === 'LOGGER_A'
        ? '2026-10-10T14:30:00+07:00'
        : '2026-10-10T14:30:00',
    cadenceMs: 5_000,
    intervalMs: 0,
    dryRun: true,
    ...overrides,
  };
}

function rawIngestFromText(input: {
  payload: string;
  format: LoggerSourceFormat;
  ingestId: string;
  externalDeviceId?: string;
}): RawIngestRecord {
  return RawIngestRecordSchema.parse({
    ingest_id: input.ingestId,
    received_at: '2026-10-10T14:30:01+07:00',
    source_type: 'SIMULATED_LOGGER',
    source_format: input.format,
    origin: 'SYNTHETIC',
    ...(input.externalDeviceId !== undefined
      ? { external_device_id: input.externalDeviceId }
      : {}),
    original_payload: input.payload,
    content_checksum_sha256: checksum(input.payload),
    ingestion_metadata: {
      transport: 'HTTP_JSON',
      content_type: 'application/json',
      payload_encoding: 'UTF-8',
    },
  });
}

function rawIngest(
  event: LoggerAEvent | LoggerBEvent,
  ingestId: string,
): RawIngestRecord {
  const externalDeviceId =
    event.source_format === 'LOGGER_A'
      ? event.payload.device_id
      : event.payload.serial;
  return rawIngestFromText({
    payload: JSON.stringify(event.payload),
    format: event.source_format,
    ingestId,
    externalDeviceId,
  });
}

function generatedEvents(
  format: 'LOGGER_A' | 'LOGGER_B',
  overrides: Partial<SimulatorConfig> = {},
): Array<LoggerAEvent | LoggerBEvent> {
  return generateLoggerEvents(simulatorConfig(format, overrides), schemas);
}

function processEvents(
  events: Array<LoggerAEvent | LoggerBEvent>,
  context?: LoggerNormalizationContext,
  prefix = 'ingest',
): RuntimeProcessingResult[] {
  return events.map((event, index) =>
    processLoggerIngest(rawIngest(event, `${prefix}-${index + 1}`), {
      ...(context !== undefined ? { normalization_context: context } : {}),
    }),
  );
}

function measurements(
  results: RuntimeProcessingResult[],
): CanonicalTimeSeriesMeasurement[] {
  return results.map((result) => {
    if (!result.success) throw new Error(JSON.stringify(result.normalization.issues));
    return result.normalization.measurement;
  });
}

function issueCodes(result: RuntimeProcessingResult): string[] {
  return result.success
    ? []
    : result.normalization.issues.map((issue) => issue.code);
}

describe('Runtime Data Pipeline v1', () => {
  it('processes a valid LOGGER_A event through the real simulator and D5', () => {
    const [event] = generatedEvents('LOGGER_A', { count: 1 });
    const result = processLoggerIngest(rawIngest(event, 'ingest-a-1'));

    expect(result).toMatchObject({
      success: true,
      pipeline_version: RUNTIME_DATA_PIPELINE_VERSION,
      ingest_id: 'ingest-a-1',
      processing_status: 'NORMALIZED',
      dq_assessment_status: 'NOT_ASSESSED',
    });
    if (!result.success) throw new Error('Expected LOGGER_A success');
    expect(result.normalization.measurement.source_format).toBe('LOGGER_A');
  });

  it('processes LOGGER_B with explicit timezone context', () => {
    const [event] = generatedEvents('LOGGER_B', { count: 1 });
    const [result] = processEvents([event], loggerBTimezone);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Expected LOGGER_B success');
    expect(result.normalization.measurement.timestamp).toBe(
      '2026-10-10T14:30:00+07:00',
    );
    expect(result.normalization.timezone_resolution.origin).toBe('DEVICE_CONTEXT');
  });

  it('preserves LOGGER_B missing-timezone failure details', () => {
    const [event] = generatedEvents('LOGGER_B', { count: 1 });
    const result = processLoggerIngest(rawIngest(event, 'ingest-b-no-timezone'));

    expect(result).toMatchObject({
      success: false,
      processing_status: 'NORMALIZATION_FAILED',
      dq_assessment_status: 'NOT_ASSESSED',
    });
    expect(issueCodes(result)).toEqual(['TIMEZONE_CONTEXT_REQUIRED']);
  });

  it('preserves malformed JSON as a structured normalization failure', () => {
    const raw = rawIngestFromText({
      payload: '{"device_id":',
      format: 'LOGGER_A',
      ingestId: 'ingest-malformed',
    });
    const result = processLoggerIngest(raw);

    expect(issueCodes(result)).toEqual(['MALFORMED_JSON_PAYLOAD']);
  });

  it('preserves raw checksum mismatch failure', () => {
    const [event] = generatedEvents('LOGGER_A', { count: 1 });
    const valid = rawIngest(event, 'ingest-bad-checksum');
    const invalid: RawIngestRecord = {
      ...valid,
      content_checksum_sha256: '0'.repeat(64),
    };
    const result = processLoggerIngest(invalid);

    expect(issueCodes(result)).toEqual(['RAW_PAYLOAD_CHECKSUM_MISMATCH']);
  });

  it('never fabricates a canonical measurement after normalization failure', () => {
    const raw = rawIngestFromText({
      payload: 'not-json',
      format: 'LOGGER_A',
      ingestId: 'ingest-no-measurement',
    });
    const result = processLoggerIngest(raw);

    expect(result.success).toBe(false);
    expect(result.normalization).not.toHaveProperty('measurement');
  });

  it('never presents unassessed DQ as PASS after normalization failure', () => {
    const [event] = generatedEvents('LOGGER_B', { count: 1 });
    const result = processLoggerIngest(rawIngest(event, 'ingest-not-assessed'));

    expect(result.processing_status).toBe('NORMALIZATION_FAILED');
    expect(result.dq_assessment_status).toBe('NOT_ASSESSED');
    expect(result).not.toHaveProperty('assessment_status', 'PASS');
  });

  it('delegates a regular successful sequence to D6 as PASS', () => {
    const canonical = measurements(
      processEvents(generatedEvents('LOGGER_A', { count: 4 })),
    );
    const result = assessProcessedSequence(canonical, {
      expected_interval_ms: 5_000,
    });

    expect(result).toMatchObject({
      success: true,
      assessment_status: 'PASS',
      summary: { measurement_count: 4, finding_count: 0 },
    });
  });

  it('preserves D6 duplicate findings for independent ingests', () => {
    const [event] = generatedEvents('LOGGER_A', { count: 1 });
    const canonical = measurements([
      ...processEvents([event], undefined, 'duplicate-a'),
      ...processEvents([event], undefined, 'duplicate-b'),
    ]);
    const result = assessProcessedSequence(canonical);

    expect(result.assessment_status).toBe('FLAGGED');
    expect(result.success && result.findings.map((item) => item.code)).toEqual([
      'DUPLICATE_RECORD',
    ]);
  });

  it('preserves D6 conflict findings', () => {
    const [event] = generatedEvents('LOGGER_A', { count: 1 });
    if (event.source_format !== 'LOGGER_A') throw new Error('Expected LOGGER_A');
    const conflicting: LoggerAEvent = {
      ...event,
      payload: { ...event.payload, temperature: event.payload.temperature + 2 },
    };
    const canonical = measurements([
      ...processEvents([event], undefined, 'conflict-a'),
      ...processEvents([conflicting], undefined, 'conflict-b'),
    ]);
    const result = assessProcessedSequence(canonical);

    expect(result.assessment_status).toBe('FLAGGED');
    expect(result.success && result.findings.map((item) => item.code)).toEqual([
      'CONFLICTING_RECORD',
    ]);
  });

  it('preserves arrival order for D6 out-of-order assessment', () => {
    const canonical = measurements(
      processEvents(generatedEvents('LOGGER_A', { count: 3 })),
    );
    const result = assessProcessedSequence([
      canonical[0],
      canonical[2],
      canonical[1],
    ]);

    expect(result.success && result.findings.map((item) => item.code)).toEqual([
      'OUT_OF_ORDER_RECORD',
    ]);
  });

  it('preserves explicit cadence gap assessment', () => {
    const all = measurements(
      processEvents(generatedEvents('LOGGER_A', { count: 5 })),
    );
    const result = assessProcessedSequence([all[0], all[1], all[4]], {
      expected_interval_ms: 5_000,
    });

    expect(result.assessment_status).toBe('FLAGGED');
    expect(result.success && result.findings[0]).toMatchObject({
      code: 'MISSING_INTERVAL',
      evidence: { estimated_missing_count: 2 },
    });
  });

  it('does not fabricate a gap without cadence configuration', () => {
    const all = measurements(
      processEvents(generatedEvents('LOGGER_A', { count: 5 })),
    );
    const result = assessProcessedSequence([all[0], all[4]]);

    expect(result).toMatchObject({
      success: true,
      assessment_status: 'PASS',
      summary: { missing_interval_count: 0 },
    });
  });

  it('does not mutate the preserved raw payload or envelope', () => {
    const [event] = generatedEvents('LOGGER_A', { count: 1 });
    const raw = rawIngest(event, 'ingest-immutable');
    const before = structuredClone(raw);

    processLoggerIngest(raw);

    expect(raw).toEqual(before);
    expect(raw.original_payload).toBe(before.original_payload);
  });

  it('returns deterministic identical processing and DQ results', () => {
    const events = generatedEvents('LOGGER_B', { count: 3 });
    const raws = events.map((event, index) => rawIngest(event, `stable-${index}`));
    const run = () => {
      const processed = raws.map((raw) =>
        processLoggerIngest(raw, { normalization_context: loggerBTimezone }),
      );
      return {
        processed,
        dq: assessProcessedSequence(measurements(processed), {
          expected_interval_ms: 5_000,
        }),
      };
    };

    expect(run()).toEqual(run());
  });

  it('preserves the complete raw-to-canonical-to-finding provenance chain', () => {
    const [event] = generatedEvents('LOGGER_A', { count: 1 });
    const firstRaw = rawIngest(event, 'ingest-provenance-first');
    const secondRaw = rawIngest(event, 'ingest-provenance-second');
    const processed = [
      processLoggerIngest(firstRaw),
      processLoggerIngest(secondRaw),
    ];
    const canonical = measurements(processed);
    const dq = assessProcessedSequence(canonical);

    expect(canonical[0]).toMatchObject({
      raw_ingest_id: firstRaw.ingest_id,
      source_checksum_sha256: firstRaw.content_checksum_sha256,
      source_sensor_id: 'LOGGER-A-001',
      source_format: 'LOGGER_A',
      parser_id: 'runtime-logger-a',
      parser_version: '1.0.0',
    });
    expect(dq.success && dq.findings[0].record_ids).toEqual(
      canonical.map((measurement) => measurement.record_id),
    );
  });
});
