import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CanonicalTimeSeriesMeasurementSchema,
  type CanonicalTimeSeriesMeasurement,
} from '@coldproof/canonical-schema';
import type { RawFileImport } from '@coldproof/parser-contracts';
import {
  analyzeShipmentTemperatures,
  SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_ID,
  SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_VERSION,
  type ShipmentTemperatureAnalysisResult,
  type TemperatureThreshold,
} from '@coldproof/runtime-data-pipeline';
import {
  assessLoggerSequence,
  type RuntimeDataQualityResult,
} from '@coldproof/runtime-data-quality';

import {
  assessImportedMeasurements,
  parseLoggerFile,
} from '../../apps/api/src/adapters/file-import';

const FIVE_MINUTES = 5 * 60 * 1_000;
const BASE_TIME = Date.parse('2026-10-10T08:00:00+07:00');

type TemperatureExpectationCase = {
  case_id: string;
  golden_id?: string;
  scenario_reference: string;
  shipment_reference: string;
  display_name: string;
  threshold_override?: {
    min_temperature_c: number;
    max_temperature_c: number;
  };
  streams: Array<{
    device_id: string;
    samples: Array<[number, number]>;
  }>;
  expected_temperature_status: 'NOT_ASSESSED' | 'IN_RANGE' | 'EXCURSION_DETECTED';
  expected_excursion_count: number;
  expected_dq_status: 'PASS' | 'FLAGGED';
};

const expectationCatalog = JSON.parse(readFileSync(
  path.join(
    process.cwd(),
    'data/demo/vietnam-healthcare/temperature-analysis-expectations.json',
  ),
  'utf8',
)) as {
  analysis_policy_id: string;
  analysis_policy_version: string;
  threshold_product_independence: string;
  default_threshold: TemperatureThreshold;
  cases: TemperatureExpectationCase[];
};

const demoThreshold: TemperatureThreshold = {
  min_temperature_c: 2,
  max_temperature_c: 8,
  unit: 'CELSIUS',
  threshold_origin: 'SYNTHETIC_DEMO_CONTEXT',
  threshold_reference_id: 'SHIP-VNHC-013:TEMP-RANGE',
  policy_id: 'DEMO_2_8C',
  policy_version: '1.0.0',
};

function timestamp(offsetMinutes: number): string {
  return new Date(BASE_TIME + offsetMinutes * 60_000).toISOString();
}

function measurement(
  id: string,
  offsetMinutes: number,
  temperatureC: number,
  deviceId = 'LOGGER-A-D11',
): CanonicalTimeSeriesMeasurement {
  return CanonicalTimeSeriesMeasurementSchema.parse({
    record_id: id,
    record_type: 'TIMESERIES',
    raw_ingest_id: `import-${id}`,
    timestamp: timestamp(offsetMinutes),
    temperature_c: temperatureC,
    humidity_pct: 70,
    source_dataset: 'COLDPROOF:D11_TEST',
    source_file: 'd11-test.csv',
    source_sensor_id: deviceId,
    source_row_or_ref: `row:${id}`,
    source_checksum_sha256: 'a'.repeat(64),
    source_format: 'VENDOR_A_CSV',
    parser_id: 'vendor-a-csv',
    parser_version: '1.0.0',
    measurement_origin: 'SYNTHETIC',
    missing_flag: false,
    duplicate_flag: false,
    conflict_flag: false,
  });
}

function sequence(temperatures: number[], offsets?: number[]): CanonicalTimeSeriesMeasurement[] {
  return temperatures.map((temperatureC, index) =>
    measurement(`rec-${index + 1}`, offsets?.[index] ?? index * 5, temperatureC));
}

function requireAssessed(result: ShipmentTemperatureAnalysisResult) {
  if (!result.success || result.temperature_status === 'NOT_ASSESSED') {
    throw new Error(`Expected assessed result: ${JSON.stringify(result)}`);
  }
  return result;
}

function requireDq(result: RuntimeDataQualityResult) {
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result;
}

function analyze(
  measurements: readonly CanonicalTimeSeriesMeasurement[],
  dataQualityResult?: RuntimeDataQualityResult,
  threshold: TemperatureThreshold = demoThreshold,
) {
  return analyzeShipmentTemperatures({
    measurements,
    threshold,
    ...(dataQualityResult !== undefined ? { data_quality_result: dataQualityResult } : {}),
    shipment_reference: 'SHIP-VNHC-013',
  });
}

function rawFileImport(content: Buffer, importId: string): RawFileImport {
  return {
    import_id: importId,
    original_filename: `${importId}.csv`,
    received_at: '2026-10-10T10:00:00+07:00',
    content_sha256: createHash('sha256').update(content).digest('hex'),
    file_size_bytes: content.length,
    media_type: 'text/csv',
    source_format: 'VENDOR_A_CSV',
    origin: 'SYNTHETIC',
    format_origin: 'VENDOR_INSPIRED',
    upload_metadata: {
      transport: 'FILE_IMPORT',
      original_name_encoding: 'UTF-8',
    },
    content,
  };
}

describe('Shipment Temperature Analysis v1', () => {
  it('classifies all samples in range', () => {
    const result = requireAssessed(analyze(sequence([5, 6, 7])));
    expect(result.temperature_status).toBe('IN_RANGE');
    expect(result.episodes).toEqual([]);
  });

  it('treats the exact minimum as in range', () => {
    expect(requireAssessed(analyze(sequence([2]))).temperature_status).toBe('IN_RANGE');
  });

  it('treats the exact maximum as in range', () => {
    expect(requireAssessed(analyze(sequence([8]))).temperature_status).toBe('IN_RANGE');
  });

  it('resolves one above-threshold sample at the first subsequent in-range sample', () => {
    const result = requireAssessed(analyze(sequence([5, 9, 5])));
    expect(result.episodes[0]).toMatchObject({
      direction: 'ABOVE_MAXIMUM',
      start_at: timestamp(5),
      end_at: timestamp(10),
      open_ended: false,
      observed_span_ms: 0,
      episode_window_duration_ms: FIVE_MINUTES,
      termination_reason: 'RETURNED_IN_RANGE',
      out_of_range_sample_count: 1,
      extreme_temperature_c: 9,
    });
  });

  it('groups consecutive above-threshold samples without interpolation', () => {
    const result = requireAssessed(analyze(sequence([5, 9, 10, 5])));
    expect(result.episodes[0]).toMatchObject({
      observed_span_ms: FIVE_MINUTES,
      episode_window_duration_ms: FIVE_MINUTES * 2,
      out_of_range_sample_count: 2,
      extreme_temperature_c: 10,
    });
  });

  it('resolves one below-threshold sample', () => {
    const result = requireAssessed(analyze(sequence([5, 1, 5])));
    expect(result.episodes[0]).toMatchObject({
      direction: 'BELOW_MINIMUM',
      observed_span_ms: 0,
      episode_window_duration_ms: FIVE_MINUTES,
      extreme_temperature_c: 1,
    });
  });

  it('groups consecutive below-threshold samples', () => {
    const result = requireAssessed(analyze(sequence([5, 1, 0.5, 5])));
    expect(result.episodes[0]).toMatchObject({
      direction: 'BELOW_MINIMUM',
      out_of_range_sample_count: 2,
      extreme_temperature_c: 0.5,
    });
  });

  it('creates multiple separated excursions', () => {
    const result = requireAssessed(analyze(sequence([5, 9, 5, 1, 5])));
    expect(result.episodes.map((episode) => episode.direction)).toEqual([
      'ABOVE_MAXIMUM',
      'BELOW_MINIMUM',
    ]);
    expect(result.summary.excursion_count).toBe(2);
  });

  it('splits a direct ABOVE to BELOW transition at the discrete sample timestamp', () => {
    const result = requireAssessed(analyze(sequence([9, 1, 5])));
    expect(result.episodes).toHaveLength(2);
    expect(result.episodes[0]).toMatchObject({
      direction: 'ABOVE_MAXIMUM',
      end_at: timestamp(5),
      termination_reason: 'DIRECTION_CHANGED',
    });
    expect(result.episodes[1]).toMatchObject({
      direction: 'BELOW_MINIMUM',
      start_at: timestamp(5),
      end_at: timestamp(10),
    });
  });

  it('starts an excursion at the first observed sample without backdating', () => {
    const result = requireAssessed(analyze(sequence([9, 5])));
    expect(result.episodes[0].start_at).toBe(timestamp(0));
  });

  it('leaves an excursion open when the sequence ends out of range', () => {
    const result = requireAssessed(analyze(sequence([5, 9, 10])));
    expect(result.episodes[0]).toMatchObject({
      end_at: null,
      open_ended: true,
      episode_window_duration_ms: null,
      observed_span_ms: FIVE_MINUTES,
      termination_reason: 'SEQUENCE_END',
      last_out_of_range_at: timestamp(10),
    });
  });

  it('returns NOT_ASSESSED for zero canonical measurements', () => {
    const result = analyze([]);
    expect(result).toMatchObject({
      success: true,
      temperature_status: 'NOT_ASSESSED',
      reason: { code: 'NO_CANONICAL_MEASUREMENTS' },
      summary: { measurement_count: 0 },
    });
    expect(result.summary).not.toHaveProperty('minimum_observed_temperature_c');
  });

  it.each([
    [2, 2],
    [9, 8],
  ])('rejects an invalid threshold range %s..%s', (minimum, maximum) => {
    const result = analyze(sequence([5]), undefined, {
      ...demoThreshold,
      min_temperature_c: minimum,
      max_temperature_c: maximum,
    });
    expect(result).toMatchObject({
      success: false,
      temperature_status: 'NOT_ASSESSED',
      errors: [{ code: 'INVALID_THRESHOLD_CONFIGURATION' }],
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a non-finite threshold value: %s',
    (minimum) => {
      const result = analyze(sequence([5]), undefined, {
        ...demoThreshold,
        min_temperature_c: minimum,
      });
      expect(result.success).toBe(false);
    },
  );

  it('requires Celsius semantics and versioned threshold policy provenance', () => {
    const result = analyze(sequence([5]), undefined, {
      ...demoThreshold,
      unit: 'FAHRENHEIT' as 'CELSIUS',
      policy_id: '',
      policy_version: '',
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Expected threshold validation failure');
    expect(result.errors.map((error) => error.field)).toEqual(expect.arrayContaining([
      'threshold.unit',
      'threshold.policy_id',
      'threshold.policy_version',
    ]));
  });

  it('represents DQ PASS and temperature IN_RANGE independently', () => {
    const records = sequence([5, 6]);
    const dq = requireDq(assessLoggerSequence(records, { expected_interval_ms: FIVE_MINUTES }));
    const result = requireAssessed(analyze(records, dq));
    expect(dq.assessment_status).toBe('PASS');
    expect(result.temperature_status).toBe('IN_RANGE');
  });

  it('represents DQ PASS and temperature EXCURSION_DETECTED independently', () => {
    const records = sequence([5, 9, 5]);
    const dq = requireDq(assessLoggerSequence(records, { expected_interval_ms: FIVE_MINUTES }));
    const result = requireAssessed(analyze(records, dq));
    expect(dq.assessment_status).toBe('PASS');
    expect(result.temperature_status).toBe('EXCURSION_DETECTED');
  });

  it('represents DQ FLAGGED and temperature IN_RANGE independently', () => {
    const records = [measurement('dup-a', 0, 5), measurement('dup-b', 0, 5)];
    const dq = requireDq(assessLoggerSequence(records));
    const result = requireAssessed(analyze(records, dq));
    expect(dq.assessment_status).toBe('FLAGGED');
    expect(result.temperature_status).toBe('IN_RANGE');
  });

  it('represents DQ FLAGGED and temperature EXCURSION_DETECTED independently', () => {
    const records = [measurement('dup-high-a', 0, 9), measurement('dup-high-b', 0, 9)];
    const dq = requireDq(assessLoggerSequence(records));
    const result = requireAssessed(analyze(records, dq));
    expect(dq.assessment_status).toBe('FLAGGED');
    expect(result.temperature_status).toBe('EXCURSION_DETECTED');
    expect(result.data_quality_context.reliability).toBe('AFFECTED_BY_DATA_QUALITY_FINDINGS');
  });

  it('uses a D6 missing interval to break continuity without redetecting the gap', () => {
    const records = sequence([9, 9, 9, 5], [0, 5, 20, 25]);
    const dq = requireDq(assessLoggerSequence(records, { expected_interval_ms: FIVE_MINUTES }));
    const result = requireAssessed(analyze(records, dq));
    expect(dq.findings.map((finding) => finding.code)).toContain('MISSING_INTERVAL');
    expect(result.episodes).toHaveLength(2);
    expect(result.episodes[0]).toMatchObject({
      termination_reason: 'DATA_GAP',
      continuity_uncertain: true,
      end_at: null,
      episode_window_duration_ms: null,
    });
    expect(result.episodes[0].data_quality_finding_ids).toContain(
      dq.findings.find((finding) => finding.code === 'MISSING_INTERVAL')?.finding_id,
    );
    expect(result.episodes[1].start_at).toBe(timestamp(20));
  });

  it('retains duplicate findings separately from temperature episodes', () => {
    const records = [measurement('dup-1', 0, 9), measurement('dup-2', 0, 9)];
    const dq = requireDq(assessLoggerSequence(records));
    const result = requireAssessed(analyze(records, dq));
    expect(dq.findings).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_RECORD' }));
    expect(result.episodes[0].data_quality_finding_ids).toEqual([
      dq.findings[0].finding_id,
    ]);
  });

  it('retains conflict findings and does not choose a winning value', () => {
    const records = [measurement('conflict-high', 0, 9), measurement('conflict-low', 0, 1)];
    const dq = requireDq(assessLoggerSequence(records));
    const result = requireAssessed(analyze(records, dq));
    expect(dq.findings).toContainEqual(expect.objectContaining({ code: 'CONFLICTING_RECORD' }));
    expect(result.episodes.map((episode) => episode.direction)).toEqual([
      'ABOVE_MAXIMUM',
      'BELOW_MINIMUM',
    ]);
  });

  it('sorts a copy without mutating out-of-order caller input', () => {
    const ordered = sequence([5, 9, 5]);
    const input = [ordered[2], ordered[0], ordered[1]];
    const before = input.map((record) => record.record_id);
    const dq = requireDq(assessLoggerSequence(input));
    const result = requireAssessed(analyze(input, dq));
    expect(input.map((record) => record.record_id)).toEqual(before);
    expect(dq.findings.map((finding) => finding.code)).toContain('OUT_OF_ORDER_RECORD');
    expect(result.episodes[0].start_at).toBe(timestamp(5));
  });

  it('isolates device streams and aggregates one excursion', () => {
    const records = [
      measurement('a-1', 0, 5, 'LOGGER-A'),
      measurement('a-2', 5, 5, 'LOGGER-A'),
      measurement('b-1', 0, 9, 'LOGGER-B'),
      measurement('b-2', 5, 5, 'LOGGER-B'),
    ];
    const result = requireAssessed(analyze(records));
    expect(result.summary).toMatchObject({
      stream_count: 2,
      streams_in_range: 1,
      streams_with_excursion: 1,
      excursion_count: 1,
    });
  });

  it('generates deterministic excursion IDs and identical repeated output', () => {
    const records = sequence([5, 9, 10, 5]);
    const first = analyze(records);
    const second = analyze(records);
    expect(second).toEqual(first);
    expect(requireAssessed(first).episodes[0].excursion_id).toMatch(/^texc_[a-f0-9]{64}$/);
  });

  it('retains analysis and threshold policy identities', () => {
    const result = requireAssessed(analyze(sequence([5])));
    expect(result.policy).toMatchObject({
      policy_id: SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_ID,
      policy_version: SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_VERSION,
      episode_interval_semantics: '[start,end)',
    });
    expect(result.threshold).toMatchObject({ policy_id: 'DEMO_2_8C', policy_version: '1.0.0' });
  });

  it('retains canonical provenance references on every episode', () => {
    const records = sequence([5, 9, 10, 5]);
    const episode = requireAssessed(analyze(records)).episodes[0];
    expect(episode.first_record_id).toBe(records[1].record_id);
    expect(episode.last_out_of_range_record_id).toBe(records[2].record_id);
    expect(episode.contributing_record_ids).toEqual([records[1].record_id, records[2].record_id]);
  });

  it('keeps the demo threshold independent from public product identity', () => {
    const result = requireAssessed(analyze(sequence([5])));
    expect(result.threshold.threshold_origin).toBe('SYNTHETIC_DEMO_CONTEXT');
    expect(result.threshold.threshold_reference_id).toBe('SHIP-VNHC-013:TEMP-RANGE');
    expect(result).not.toHaveProperty('product_reference');
  });

  it('emits no compliance, release, disposition, or QA verdict', () => {
    const serialized = JSON.stringify(analyze(sequence([5, 9, 5])));
    expect(serialized).not.toMatch(/compliance|approved|rejected|disposition|product_release|qa_decision/i);
  });

  it('has no NestJS, Prisma, database, network, or environment dependency in the pure core', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'packages/runtime-data-pipeline/src/shipment-temperature-analysis.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/@nestjs|@prisma|DATABASE_URL|process\.env|fetch\(|axios|node:fs/);
  });
});

describe('D10 → D6 → D11 integration', () => {
  it('keeps accepted import, DQ PASS, and temperature excursion independent', async () => {
    const content = Buffer.from([
      'device_id,recorded_at,temperature_c,humidity_percent',
      'LOGGER-A-D11,2026-10-10T08:00:00+07:00,5.0,70',
      'LOGGER-A-D11,2026-10-10T08:05:00+07:00,9.5,70',
      'LOGGER-A-D11,2026-10-10T08:10:00+07:00,5.0,70',
    ].join('\n'), 'utf8');
    const imported = await parseLoggerFile(rawFileImport(content, 'import-d11-pass'));
    const dq = assessImportedMeasurements(imported, { expected_interval_ms: FIVE_MINUTES });
    if (!('success' in dq)) throw new Error(dq.reason);
    const temperature = analyzeShipmentTemperatures({
      measurements: imported.canonical_measurements,
      threshold: demoThreshold,
      data_quality_result: dq,
      shipment_reference: 'SHIP-VNHC-013',
    });

    expect(imported.file_status).toBe('ACCEPTED');
    expect(dq).toMatchObject({ success: true, assessment_status: 'PASS' });
    expect(temperature).toMatchObject({
      success: true,
      temperature_status: 'EXCURSION_DETECTED',
      shipment_reference: 'SHIP-VNHC-013',
    });
  });

  it('keeps accepted import, DQ FLAGGED, and temperature excursion independent', async () => {
    const content = Buffer.from([
      'device_id,recorded_at,temperature_c,humidity_percent',
      'LOGGER-A-D11,2026-10-10T08:00:00+07:00,9.0,70',
      'LOGGER-A-D11,2026-10-10T08:05:00+07:00,9.5,70',
      'LOGGER-A-D11,2026-10-10T08:20:00+07:00,9.2,70',
      'LOGGER-A-D11,2026-10-10T08:25:00+07:00,5.0,70',
    ].join('\n'), 'utf8');
    const imported = await parseLoggerFile(rawFileImport(content, 'import-d11-gap'));
    const dq = assessImportedMeasurements(imported, { expected_interval_ms: FIVE_MINUTES });
    if (!('success' in dq)) throw new Error(dq.reason);
    const temperature = requireAssessed(analyzeShipmentTemperatures({
      measurements: imported.canonical_measurements,
      threshold: demoThreshold,
      data_quality_result: dq,
    }));

    expect(imported.file_status).toBe('ACCEPTED');
    expect(dq).toMatchObject({ success: true, assessment_status: 'FLAGGED' });
    expect(temperature.temperature_status).toBe('EXCURSION_DETECTED');
    expect(temperature.episodes[0].termination_reason).toBe('DATA_GAP');
  });

  it('analyzes only canonical rows from a partial import', async () => {
    const content = Buffer.from([
      'device_id,recorded_at,temperature_c,humidity_percent',
      'LOGGER-A-D11,2026-10-10T08:00:00+07:00,5.0,70',
      'LOGGER-A-D11,2026-10-10T08:05:00+07:00,bad,70',
      'LOGGER-A-D11,2026-10-10T08:10:00+07:00,9.5,70',
      'LOGGER-A-D11,2026-10-10T08:15:00+07:00,5.0,70',
    ].join('\n'), 'utf8');
    const imported = await parseLoggerFile(rawFileImport(content, 'import-d11-partial'));
    const result = requireAssessed(analyzeShipmentTemperatures({
      measurements: imported.canonical_measurements,
      threshold: demoThreshold,
    }));

    expect(imported).toMatchObject({
      file_status: 'ACCEPTED_WITH_REJECTIONS',
      counts: { candidate_data_rows: 4, canonical_rows: 3, rejected_data_rows: 1 },
    });
    expect(result.summary.measurement_count).toBe(3);
    expect(result.temperature_status).toBe('EXCURSION_DETECTED');
    expect(result.episodes.flatMap((episode) => episode.contributing_record_ids)).toHaveLength(1);
  });
});

describe('Vietnam healthcare temperature-analysis expectations', () => {
  it('defines all 20 required deterministic cases and six golden cases', () => {
    expect(expectationCatalog.cases).toHaveLength(20);
    expect(new Set(expectationCatalog.cases.map((item) => item.case_id)).size).toBe(20);
    expect(expectationCatalog.cases.filter((item) => item.golden_id)).toHaveLength(6);
    expect(expectationCatalog.cases.map((item) => item.case_id)).toEqual(expect.arrayContaining([
      'NORMAL_IN_RANGE',
      'EXACT_MINIMUM_BOUNDARY',
      'EXACT_MAXIMUM_BOUNDARY',
      'ABOVE_THRESHOLD_SINGLE_SAMPLE',
      'ABOVE_THRESHOLD_MULTI_SAMPLE',
      'BELOW_THRESHOLD_SINGLE_SAMPLE',
      'BELOW_THRESHOLD_MULTI_SAMPLE',
      'MULTIPLE_EXCURSIONS',
      'ABOVE_THEN_BELOW',
      'EXCURSION_AT_SEQUENCE_START',
      'OPEN_ENDED_EXCURSION',
      'DQ_GAP_DURING_EXCURSION',
      'DQ_DUPLICATE_WITH_IN_RANGE_TEMP',
      'DQ_DUPLICATE_WITH_EXCURSION',
      'DQ_CONFLICT_WITH_EXCURSION',
      'PARTIAL_IMPORT_WITH_EXCURSION',
      'NO_CANONICAL_DATA',
      'MULTI_DEVICE_ONE_EXCURSION',
      'INVALID_THRESHOLD_MIN_EQUALS_MAX',
      'INVALID_THRESHOLD_MIN_GREATER_THAN_MAX',
    ]));
  });

  it.each(expectationCatalog.cases)(
    'matches deterministic expectation $case_id',
    (expectation) => {
      const records = expectation.streams.flatMap((stream, streamIndex) =>
        stream.samples.map(([offsetMinutes, temperatureC], sampleIndex) =>
          measurement(
            `${expectation.case_id}-${streamIndex + 1}-${sampleIndex + 1}`,
            offsetMinutes,
            temperatureC,
            stream.device_id,
          )),
      );
      const dq = requireDq(assessLoggerSequence(records, {
        expected_interval_ms: FIVE_MINUTES,
      }));
      const threshold = {
        ...expectationCatalog.default_threshold,
        ...expectation.threshold_override,
      };
      const result = analyzeShipmentTemperatures({
        measurements: records,
        threshold,
        data_quality_result: dq,
        shipment_reference: expectation.shipment_reference,
      });

      expect(dq.assessment_status).toBe(expectation.expected_dq_status);
      expect(result.temperature_status).toBe(expectation.expected_temperature_status);
      expect(result.summary.excursion_count).toBe(expectation.expected_excursion_count);
    },
  );

  it('keeps demo thresholds synthetic and independent from public product references', () => {
    expect(expectationCatalog).toMatchObject({
      analysis_policy_id: SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_ID,
      analysis_policy_version: SHIPMENT_TEMPERATURE_ANALYSIS_POLICY_VERSION,
      default_threshold: {
        threshold_origin: 'SYNTHETIC_DEMO_CONTEXT',
        policy_id: 'DEMO_2_8C',
      },
    });
    expect(expectationCatalog.threshold_product_independence).toContain('not inferred');
    expect(JSON.stringify(expectationCatalog)).not.toMatch(/Vaxigrip|Influvac|Gardasil|Prevenar/);
  });

  it('retains UTF-8 Vietnamese labels and valid scenario references', () => {
    expect(expectationCatalog.cases.map((item) => item.display_name)).toContain(
      'Khoảng dữ liệu bị thiếu — không suy diễn nhiệt độ liên tục',
    );
    for (const item of expectationCatalog.cases) {
      expect(existsSync(path.join(
        process.cwd(),
        `data/demo/vietnam-healthcare/scenarios/${item.scenario_reference}.json`,
      ))).toBe(true);
    }
  });
});
