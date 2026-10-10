import { createHash } from 'node:crypto';

import type { CanonicalTimeSeriesMeasurement } from '@coldproof/canonical-schema';
import {
  normalizeLoggerIngest,
  type LoggerNormalizationContext,
} from '@coldproof/logger-normalizer';
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
  assessLoggerSequence,
  RUNTIME_DQ_POLICY_ID,
  type RuntimeDataQualityFinding,
  type RuntimeDataQualityResult,
} from '@coldproof/runtime-data-quality';

import {
  generateLoggerEvents,
  type LoggerSchemas,
  type SimulatorConfig,
} from '../../scripts/simulated-logger-core.cjs';

const schemas: LoggerSchemas = {
  LOGGER_A: LoggerAEventSchema,
  LOGGER_B: LoggerBEventSchema,
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

function rawIngest(
  event: LoggerAEvent | LoggerBEvent,
  ingestId: string,
): RawIngestRecord {
  const originalPayload = JSON.stringify(event.payload);
  const externalDeviceId =
    event.source_format === 'LOGGER_A'
      ? event.payload.device_id
      : event.payload.serial;
  return RawIngestRecordSchema.parse({
    ingest_id: ingestId,
    received_at: '2026-10-10T14:30:01+07:00',
    source_type: 'SIMULATED_LOGGER',
    source_format: event.source_format as LoggerSourceFormat,
    origin: 'SYNTHETIC',
    external_device_id: externalDeviceId,
    original_payload: originalPayload,
    content_checksum_sha256: checksum(originalPayload),
    ingestion_metadata: {
      transport: 'HTTP_JSON',
      content_type: 'application/json',
      payload_encoding: 'UTF-8',
    },
  });
}

function normalizeEvents(
  events: Array<LoggerAEvent | LoggerBEvent>,
  context?: LoggerNormalizationContext,
  ingestPrefix = 'ingest',
): CanonicalTimeSeriesMeasurement[] {
  return events.map((event, index) => {
    const result = normalizeLoggerIngest(
      rawIngest(event, `${ingestPrefix}_${event.source_format}_${index + 1}`),
      context,
    );
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    return result.measurement;
  });
}

function requireSuccess(result: RuntimeDataQualityResult) {
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result;
}

function findings(
  result: RuntimeDataQualityResult,
  code: RuntimeDataQualityFinding['code'],
): RuntimeDataQualityFinding[] {
  return result.success
    ? result.findings.filter((finding) => finding.code === code)
    : [];
}

describe('Runtime Data Quality v1', () => {
  it('returns no findings for a regular LOGGER_A simulator sequence', () => {
    const events = generateLoggerEvents(simulatorConfig('LOGGER_A'), schemas);
    const canonical = normalizeEvents(events);
    const result = requireSuccess(
      assessLoggerSequence(canonical, { expected_interval_ms: 5_000 }),
    );

    expect(result.assessment_status).toBe('PASS');
    expect(result.findings).toEqual([]);
    expect(result.record_assessments.every((item) => item.status === 'PASS')).toBe(true);
  });

  it('returns no findings for regular LOGGER_B with explicit timezone context', () => {
    const events = generateLoggerEvents(simulatorConfig('LOGGER_B'), schemas);
    const canonical = normalizeEvents(events, {
      timezone: {
        utc_offset: '+07:00',
        origin: 'DEVICE_CONTEXT',
      },
    });

    expect(
      requireSuccess(
        assessLoggerSequence(canonical, { expected_interval_ms: 5_000 }),
      ).findings,
    ).toEqual([]);
  });

  it('distinguishes independent ingest IDs and detects equivalent physical duplicates', () => {
    const [event] = generateLoggerEvents(
      simulatorConfig('LOGGER_A', { count: 1 }),
      schemas,
    );
    const canonical = [
      ...normalizeEvents([event], undefined, 'ingest_first'),
      ...normalizeEvents([event], undefined, 'ingest_second'),
    ];
    const result = requireSuccess(assessLoggerSequence(canonical));
    const [duplicate] = findings(result, 'DUPLICATE_RECORD');

    expect(canonical[0].record_id).not.toBe(canonical[1].record_id);
    expect(result.assessment_status).toBe('FLAGGED');
    expect(result.record_assessments.every((item) => item.status === 'FLAGGED')).toBe(true);
    expect(duplicate.record_ids).toEqual([
      canonical[0].record_id,
      canonical[1].record_id,
    ]);
    expect(findings(result, 'CONFLICTING_RECORD')).toHaveLength(0);
  });

  it('classifies same-device same-time different values as a conflict', () => {
    const [event] = generateLoggerEvents(
      simulatorConfig('LOGGER_A', { count: 1 }),
      schemas,
    );
    if (event.source_format !== 'LOGGER_A') throw new Error('Expected LOGGER_A');
    const conflictingEvent: LoggerAEvent = {
      ...event,
      payload: { ...event.payload, temperature: event.payload.temperature + 3.2 },
    };
    const canonical = [
      ...normalizeEvents([event], undefined, 'ingest_observed'),
      ...normalizeEvents([conflictingEvent], undefined, 'ingest_conflicting'),
    ];
    const result = requireSuccess(assessLoggerSequence(canonical));
    const [conflict] = findings(result, 'CONFLICTING_RECORD');

    expect(conflict.record_ids).toEqual(canonical.map((item) => item.record_id));
    expect(findings(result, 'DUPLICATE_RECORD')).toHaveLength(0);
  });

  it('detects timestamp regression using arrival order', () => {
    const events = generateLoggerEvents(simulatorConfig('LOGGER_A'), schemas);
    const canonical = normalizeEvents(events);
    const input = [canonical[0], canonical[2], canonical[1]];
    const result = requireSuccess(
      assessLoggerSequence(input, { expected_interval_ms: 5_000 }),
    );
    const [outOfOrder] = findings(result, 'OUT_OF_ORDER_RECORD');

    expect(outOfOrder.record_ids).toEqual([
      canonical[2].record_id,
      canonical[1].record_id,
    ]);
    expect(findings(result, 'MISSING_INTERVAL')).toHaveLength(0);
  });

  it('reports a half-open missing interval without creating measurements', () => {
    const events = generateLoggerEvents(
      simulatorConfig('LOGGER_A', { count: 5 }),
      schemas,
    );
    const allCanonical = normalizeEvents(events);
    const canonical = [allCanonical[0], allCanonical[1], allCanonical[4]];
    const result = requireSuccess(
      assessLoggerSequence(canonical, { expected_interval_ms: 5_000 }),
    );
    const [gap] = findings(result, 'MISSING_INTERVAL');

    expect(gap.evidence).toMatchObject({
      interval: {
        start: canonical[1].timestamp,
        end: canonical[2].timestamp,
        semantics: '[start,end)',
      },
      observed_delta_ms: 15_000,
      expected_interval_ms: 5_000,
      estimated_missing_count: 2,
    });
    expect(result.summary.measurement_count).toBe(3);
    expect(result).not.toHaveProperty('measurements');
  });

  it('partitions sequence state by device identity', () => {
    const firstDevice = normalizeEvents(
      generateLoggerEvents(simulatorConfig('LOGGER_A', { count: 1 }), schemas),
    );
    const secondDevice = normalizeEvents(
      generateLoggerEvents(
        simulatorConfig('LOGGER_A', {
          count: 1,
          deviceId: 'LOGGER-A-002',
        }),
        schemas,
      ),
      undefined,
      'ingest_second_device',
    );
    const result = requireSuccess(
      assessLoggerSequence([...firstDevice, ...secondDevice]),
    );

    expect(result.findings).toEqual([]);
    expect(result.summary.device_count).toBe(2);
  });

  it('returns deterministic identical results and preserves canonical input', () => {
    const canonical = normalizeEvents(
      generateLoggerEvents(simulatorConfig('LOGGER_A', { count: 4 }), schemas),
    );
    const before = structuredClone(canonical);
    const config = { expected_interval_ms: 5_000, tolerance_ms: 0 };

    const first = assessLoggerSequence(canonical, config);
    const second = assessLoggerSequence(canonical, config);

    expect(second).toEqual(first);
    expect(canonical).toEqual(before);
  });

  it('does not infer missing intervals without explicit cadence', () => {
    const events = generateLoggerEvents(
      simulatorConfig('LOGGER_A', { count: 5 }),
      schemas,
    );
    const canonical = normalizeEvents(events);
    const result = requireSuccess(
      assessLoggerSequence([canonical[0], canonical[4]]),
    );

    expect(findings(result, 'MISSING_INTERVAL')).toHaveLength(0);
    expect(result.policy).not.toHaveProperty('expected_interval_ms');
  });

  it('treats expected interval plus tolerance as an inclusive no-gap boundary', () => {
    const canonical = normalizeEvents(
      generateLoggerEvents(simulatorConfig('LOGGER_A', { count: 2 }), schemas),
    );
    const boundary = [
      canonical[0],
      { ...canonical[1], timestamp: '2026-10-10T14:30:06+07:00' },
    ];
    const beyond = [
      canonical[0],
      { ...canonical[1], timestamp: '2026-10-10T14:30:06.001+07:00' },
    ];

    expect(
      findings(
        assessLoggerSequence(boundary, {
          expected_interval_ms: 5_000,
          tolerance_ms: 1_000,
        }),
        'MISSING_INTERVAL',
      ),
    ).toHaveLength(0);
    expect(
      findings(
        assessLoggerSequence(beyond, {
          expected_interval_ms: 5_000,
          tolerance_ms: 1_000,
        }),
        'MISSING_INTERVAL',
      ),
    ).toHaveLength(1);
  });

  it('preserves provenance record IDs in findings and records policy identity', () => {
    const [event] = generateLoggerEvents(
      simulatorConfig('LOGGER_A', { count: 1 }),
      schemas,
    );
    const first = normalizeEvents([event], undefined, 'ingest_first')[0];
    const second = normalizeEvents([event], undefined, 'ingest_second')[0];
    const result = requireSuccess(assessLoggerSequence([first, second]));

    expect(result.findings[0].record_ids).toEqual([
      first.record_id,
      second.record_id,
    ]);
    expect(result.policy.policy_id).toBe(RUNTIME_DQ_POLICY_ID);
    expect(first.raw_ingest_id).toBeDefined();
    expect(second.raw_ingest_id).toBeDefined();
  });

  it('keeps duplicate and conflict findings distinct at one timestamp', () => {
    const [event] = generateLoggerEvents(
      simulatorConfig('LOGGER_A', { count: 1 }),
      schemas,
    );
    if (event.source_format !== 'LOGGER_A') throw new Error('Expected LOGGER_A');
    const canonical = normalizeEvents([event], undefined, 'ingest_original')[0];
    const duplicate = normalizeEvents([event], undefined, 'ingest_duplicate')[0];
    const conflictingEvent: LoggerAEvent = {
      ...event,
      payload: { ...event.payload, temperature: event.payload.temperature + 2 },
    };
    const conflict = normalizeEvents(
      [conflictingEvent],
      undefined,
      'ingest_conflict',
    )[0];
    const result = requireSuccess(
      assessLoggerSequence([canonical, duplicate, conflict]),
    );

    expect(findings(result, 'DUPLICATE_RECORD')).toHaveLength(1);
    expect(findings(result, 'CONFLICTING_RECORD')).toHaveLength(1);
    expect(result.summary).toMatchObject({
      duplicate_record_count: 1,
      conflicting_record_count: 1,
    });
  });

  it('returns NOT_ASSESSED for invalid cadence configuration', () => {
    const result = assessLoggerSequence([], {
      expected_interval_ms: 0,
    });

    expect(result).toMatchObject({
      success: false,
      assessment_status: 'NOT_ASSESSED',
      policy_id: RUNTIME_DQ_POLICY_ID,
    });
  });
});
