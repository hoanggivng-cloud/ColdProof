import { createHash } from 'node:crypto';

import type { CanonicalTimeSeriesMeasurement } from '@coldproof/canonical-schema';
import type {
  LoggerAEvent,
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
} from '@coldproof/runtime-data-pipeline';
import type {
  RuntimeDataQualityFinding,
  RuntimeDataQualityResult,
} from '@coldproof/runtime-data-quality';
import {
  QAComparisonRecordSchema,
  TripMeasurementAssociationSchema,
  type QAComparisonRecord,
  type QADataQualityProjection,
  type TripMeasurementAssociation,
} from '@coldproof/shared-types';

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

function simulatorConfig(overrides: Partial<SimulatorConfig> = {}): SimulatorConfig {
  return {
    help: false,
    format: 'LOGGER_A',
    deviceId: 'LOGGER-A-001',
    count: 1,
    seed: 42,
    startTime: '2026-10-10T14:30:00+07:00',
    cadenceMs: 5_000,
    intervalMs: 0,
    dryRun: true,
    ...overrides,
  };
}

function rawIngest(event: LoggerAEvent, ingestId: string): RawIngestRecord {
  const originalPayload = JSON.stringify(event.payload);
  return RawIngestRecordSchema.parse({
    ingest_id: ingestId,
    received_at: '2026-10-10T14:30:01+07:00',
    source_type: 'SIMULATED_LOGGER',
    source_format: 'LOGGER_A',
    origin: 'SYNTHETIC',
    external_device_id: event.payload.device_id,
    original_payload: originalPayload,
    content_checksum_sha256: checksum(originalPayload),
    ingestion_metadata: {
      transport: 'HTTP_JSON',
      content_type: 'application/json',
      payload_encoding: 'UTF-8',
      request_ref: `request:${ingestId}`,
    },
  });
}

function generatedLoggerA(): LoggerAEvent {
  const [event] = generateLoggerEvents(simulatorConfig(), schemas);
  if (event.source_format !== 'LOGGER_A') throw new Error('Expected LOGGER_A');
  return event;
}

function process(raw: RawIngestRecord) {
  const result = processLoggerIngest(raw);
  if (!result.success) throw new Error(JSON.stringify(result.normalization.issues));
  return result.normalization;
}

function association(
  measurement: CanonicalTimeSeriesMeasurement,
  status: 'UNASSIGNED' | 'ASSIGNED' = 'ASSIGNED',
): TripMeasurementAssociation {
  return TripMeasurementAssociationSchema.parse({
    canonical_record_id: measurement.record_id,
    raw_ingest_id: measurement.raw_ingest_id,
    source_sensor_id: measurement.source_sensor_id,
    observed_at: measurement.timestamp,
    association_status: status,
    ...(status === 'ASSIGNED'
      ? {
          trip_id: 'TRIP-DEMO-001',
          association_method: 'IMPORT_CONTEXT',
        }
      : {}),
    association_provenance: {
      origin:
        status === 'ASSIGNED'
          ? 'SYNTHETIC_DEMO_CONTEXT'
          : 'OPERATIONAL_RUNTIME',
      resolver_id: 'tv2-trip-association-contract-fixture',
      resolver_version: '1.0.0',
    },
  });
}

function dqProjection(
  result: RuntimeDataQualityResult,
  recordId: string,
): QADataQualityProjection {
  if (!result.success) {
    return {
      assessment_status: 'NOT_ASSESSED',
      policy_id: result.policy_id,
      finding_ids: [],
      findings: [],
    };
  }
  const recordAssessment = result.record_assessments.find(
    (item) => item.record_id === recordId,
  );
  if (recordAssessment === undefined) throw new Error('Missing record assessment');
  const findings = result.findings.filter((finding) =>
    finding.record_ids.includes(recordId),
  );
  return {
    assessment_status: recordAssessment.status,
    policy_id: result.policy.policy_id,
    finding_ids: findings.map((finding) => finding.finding_id),
    findings: findings.map((finding) => ({
      finding_id: finding.finding_id,
      code: finding.code,
      record_ids: finding.record_ids,
      evidence: finding.evidence,
    })),
  };
}

function comparison(input?: {
  raw?: RawIngestRecord;
  measurement?: CanonicalTimeSeriesMeasurement;
  dq?: RuntimeDataQualityResult;
  trip?: TripMeasurementAssociation;
}): QAComparisonRecord {
  const raw = input?.raw ?? rawIngest(generatedLoggerA(), 'ingest-comparison');
  const normalization = process(raw);
  const measurement = input?.measurement ?? normalization.measurement;
  const dq = input?.dq ??
    assessProcessedSequence([measurement], { expected_interval_ms: 5_000 });
  return QAComparisonRecordSchema.parse({
    projection_version: 'qa-comparison-v1',
    raw,
    canonical: measurement,
    normalization: {
      timezone_resolution: normalization.timezone_resolution,
      normalization_notes: normalization.normalization_notes,
    },
    data_quality: dqProjection(dq, measurement.record_id),
    trip_association: input?.trip ?? association(measurement),
  });
}

function duplicateFixture(): {
  raw: RawIngestRecord;
  measurement: CanonicalTimeSeriesMeasurement;
  dq: RuntimeDataQualityResult;
} {
  const event = generatedLoggerA();
  const firstRaw = rawIngest(event, 'ingest-duplicate-first');
  const secondRaw = rawIngest(event, 'ingest-duplicate-second');
  const first = process(firstRaw).measurement;
  const second = process(secondRaw).measurement;
  return {
    raw: firstRaw,
    measurement: first,
    dq: assessProcessedSequence([first, second]),
  };
}

describe('Data Integration Handoff Contracts v1', () => {
  it('accepts a valid assigned trip association without physical values', () => {
    const result = comparison().trip_association;

    expect(result).toMatchObject({
      trip_id: 'TRIP-DEMO-001',
      association_status: 'ASSIGNED',
      association_method: 'IMPORT_CONTEXT',
    });
    expect(result).not.toHaveProperty('temperature_c');
    expect(result).not.toHaveProperty('humidity_pct');
  });

  it('accepts an explicit UNASSIGNED state without treating it as an error', () => {
    const raw = rawIngest(generatedLoggerA(), 'ingest-unassigned');
    const measurement = process(raw).measurement;
    const result = TripMeasurementAssociationSchema.safeParse(
      association(measurement, 'UNASSIGNED'),
    );

    expect(result.success).toBe(true);
    expect(result.success && result.data.association_status).toBe('UNASSIGNED');
  });

  it('requires trip identity and method for ASSIGNED state', () => {
    const raw = rawIngest(generatedLoggerA(), 'ingest-assigned-invalid');
    const measurement = process(raw).measurement;
    const result = TripMeasurementAssociationSchema.safeParse({
      canonical_record_id: measurement.record_id,
      raw_ingest_id: raw.ingest_id,
      source_sensor_id: measurement.source_sensor_id,
      observed_at: measurement.timestamp,
      association_status: 'ASSIGNED',
      association_provenance: {
        origin: 'OPERATIONAL_RUNTIME',
        resolver_id: 'tv2-runtime',
        resolver_version: '1.0.0',
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid or missing canonical record reference', () => {
    const raw = rawIngest(generatedLoggerA(), 'ingest-invalid-reference');
    const measurement = process(raw).measurement;
    const valid = association(measurement);

    expect(
      TripMeasurementAssociationSchema.safeParse({
        ...valid,
        canonical_record_id: '',
      }).success,
    ).toBe(false);
  });

  it('rejects a QA projection whose raw and canonical ingest links disagree', () => {
    const valid = comparison();
    const result = QAComparisonRecordSchema.safeParse({
      ...valid,
      canonical: { ...valid.canonical, raw_ingest_id: 'ingest-other' },
    });

    expect(result.success).toBe(false);
  });

  it('represents DQ PASS independently from an UNASSIGNED trip', () => {
    const raw = rawIngest(generatedLoggerA(), 'ingest-pass-unassigned');
    const normalization = process(raw);
    const measurement = normalization.measurement;
    const result = comparison({
      raw,
      measurement,
      trip: association(measurement, 'UNASSIGNED'),
    });

    expect(result.data_quality.assessment_status).toBe('PASS');
    expect(result.trip_association.association_status).toBe('UNASSIGNED');
  });

  it('represents DQ FLAGGED independently from an ASSIGNED trip', () => {
    const fixture = duplicateFixture();
    const result = comparison({
      ...fixture,
      trip: association(fixture.measurement),
    });

    expect(result.data_quality.assessment_status).toBe('FLAGGED');
    expect(result.trip_association.association_status).toBe('ASSIGNED');
  });

  it('keeps NOT_ASSESSED distinct from PASS', () => {
    const valid = comparison();
    const notAssessed = QAComparisonRecordSchema.parse({
      ...valid,
      data_quality: {
        assessment_status: 'NOT_ASSESSED',
        finding_ids: [],
        findings: [],
      },
    });

    expect(notAssessed.data_quality.assessment_status).toBe('NOT_ASSESSED');
    expect(notAssessed.data_quality.assessment_status).not.toBe('PASS');
  });

  it('preserves the exact original raw payload for QA inspection', () => {
    const result = comparison();
    const expectedPayload = result.raw.original_payload;

    expect(result.raw.original_payload).toBe(expectedPayload);
    expect(checksum(result.raw.original_payload)).toBe(
      result.raw.content_checksum_sha256,
    );
  });

  it('preserves canonical parser provenance', () => {
    const result = comparison();

    expect(result.canonical).toMatchObject({
      parser_id: 'runtime-logger-a',
      parser_version: '1.0.0',
    });
    expect(result.normalization.timezone_resolution.origin).toBe(
      'PAYLOAD_DECLARED',
    );
  });

  it('preserves DQ policy provenance', () => {
    const result = comparison();

    expect(result.data_quality.policy_id).toBe('runtime-dq-v1');
  });

  it('preserves trip association provenance', () => {
    const result = comparison();

    expect(result.trip_association.association_provenance).toEqual({
      origin: 'SYNTHETIC_DEMO_CONTEXT',
      resolver_id: 'tv2-trip-association-contract-fixture',
      resolver_version: '1.0.0',
    });
  });

  it('validates the real D4 to D7 path through a synthetic trip projection', () => {
    const result = comparison();

    expect(result).toMatchObject({
      projection_version: 'qa-comparison-v1',
      raw: { ingest_id: 'ingest-comparison' },
      canonical: {
        raw_ingest_id: 'ingest-comparison',
        source_sensor_id: 'LOGGER-A-001',
      },
      data_quality: { assessment_status: 'PASS' },
      trip_association: {
        trip_id: 'TRIP-DEMO-001',
        association_provenance: { origin: 'SYNTHETIC_DEMO_CONTEXT' },
      },
    });
  });

  it('does not mutate canonical physical values while validating projection', () => {
    const raw = rawIngest(generatedLoggerA(), 'ingest-physical-immutability');
    const measurement = process(raw).measurement;
    const before = structuredClone(measurement);

    comparison({ raw, measurement });

    expect(measurement).toEqual(before);
  });

  it('produces deterministic schema output and serialization', () => {
    const value = comparison();
    const first = QAComparisonRecordSchema.parse(value);
    const second = QAComparisonRecordSchema.parse(value);

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('requires every projected finding to reference the displayed record', () => {
    const fixture = duplicateFixture();
    const valid = comparison(fixture);
    const finding = valid.data_quality.findings[0] as RuntimeDataQualityFinding;
    const result = QAComparisonRecordSchema.safeParse({
      ...valid,
      data_quality: {
        ...valid.data_quality,
        findings: [{ ...finding, record_ids: ['rec-other'] }],
      },
    });

    expect(result.success).toBe(false);
  });
});
