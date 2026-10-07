import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { CanonicalTimeSeriesMeasurement } from '@coldproof/canonical-schema';
import type { FileMetadata } from '@coldproof/parser-contracts';

import { ZenodoAdapter } from '../adapters/zenodo/zenodo.adapter';
import { NormalizationService } from '../normalization/normalization.service';
import { DataQualityService } from './data-quality.service';
import type { DataQualityResult, TimeSeriesQualityIssue } from './data-quality.types';

const CHECKSUM = 'a'.repeat(64);

function measurement(
  recordId: string,
  timestamp: string,
  overrides: Partial<CanonicalTimeSeriesMeasurement> = {},
): CanonicalTimeSeriesMeasurement {
  return {
    record_id: recordId,
    record_type: 'TIMESERIES',
    timestamp,
    temperature_c: 4.5,
    humidity_pct: 70,
    source_dataset: 'TEST_DATASET',
    source_file: 'SENSOR01.CSV',
    source_sensor_id: 'SENSOR01',
    source_row_or_ref: `row:${recordId}`,
    source_checksum_sha256: CHECKSUM,
    source_format: 'CSV_SEMICOLON',
    parser_id: 'test-parser',
    parser_version: '1.0.0',
    measurement_origin: 'SYNTHETIC',
    missing_flag: false,
    duplicate_flag: false,
    conflict_flag: false,
    ...overrides,
  };
}

function requireSuccess(result: DataQualityResult) {
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result;
}

function issuesWithCode<Code extends TimeSeriesQualityIssue['code']>(
  result: DataQualityResult,
  code: Code,
): Extract<TimeSeriesQualityIssue, { code: Code }>[] {
  if (!result.success) return [];
  return result.issues.filter(
    (issue): issue is Extract<TimeSeriesQualityIssue, { code: Code }> => issue.code === code,
  );
}

const service = new DataQualityService();
const fiveSecondPolicy = { expectedIntervalSeconds: 5 };

describe('DataQualityService.evaluateTimeSeries', () => {
  it('returns no issues for a perfectly regular series', () => {
    const result = requireSuccess(
      service.evaluateTimeSeries(
        [
          measurement('rec-1', '2024-09-02T08:00:00+02:00'),
          measurement('rec-2', '2024-09-02T08:00:05+02:00'),
          measurement('rec-3', '2024-09-02T08:00:10+02:00'),
        ],
        fiveSecondPolicy,
      ),
    );

    expect(result.issues).toEqual([]);
    expect(result.summary).toMatchObject({
      measurementCount: 3,
      streamCount: 1,
      issueCount: 0,
    });
  });

  it.each([
    ['2024-09-02T08:00:10+02:00', 1],
    ['2024-09-02T08:00:20+02:00', 3],
  ])('reports a deterministic missing count for a gap ending at %s', (timestamp, missingCount) => {
    const result = service.evaluateTimeSeries(
      [
        measurement('rec-before', '2024-09-02T08:00:00+02:00'),
        measurement('rec-after', timestamp),
      ],
      fiveSecondPolicy,
    );
    const [issue] = issuesWithCode(result, 'MISSING_INTERVAL');

    expect(issue.record_ids).toEqual(['rec-before', 'rec-after']);
    expect(issue.context).toMatchObject({
      previous_record_id: 'rec-before',
      next_record_id: 'rec-after',
      expected_interval_seconds: 5,
      missing_count: missingCount,
    });
  });

  it('emits one duplicate issue for two records at the same timestamp', () => {
    const timestamp = '2024-09-02T08:00:00+02:00';
    const result = service.evaluateTimeSeries(
      [measurement('rec-1', timestamp), measurement('rec-2', timestamp)],
      fiveSecondPolicy,
    );
    const duplicates = issuesWithCode(result, 'DUPLICATE_TIMESTAMP');

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].record_ids).toEqual(['rec-1', 'rec-2']);
    expect(duplicates[0].context).toEqual({ timestamp, duplicate_count: 2 });
  });

  it('emits one deterministic duplicate issue for three records at one timestamp', () => {
    const timestamp = '2024-09-02T08:00:00+02:00';
    const records = [
      measurement('rec-1', timestamp),
      measurement('rec-2', timestamp),
      measurement('rec-3', timestamp),
    ];
    const first = requireSuccess(service.evaluateTimeSeries(records, fiveSecondPolicy));
    const second = requireSuccess(service.evaluateTimeSeries(records, fiveSecondPolicy));
    const duplicates = first.issues.filter((issue) => issue.code === 'DUPLICATE_TIMESTAMP');

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].record_ids).toEqual(['rec-1', 'rec-2', 'rec-3']);
    expect(duplicates[0].context.duplicate_count).toBe(3);
    expect(second).toEqual(first);
  });

  it('does not treat equal timestamps in different sensor streams as duplicates', () => {
    const timestamp = '2024-09-02T08:00:00+02:00';
    const result = requireSuccess(
      service.evaluateTimeSeries(
        [
          measurement('rec-s1', timestamp),
          measurement('rec-s2', timestamp, {
            source_file: 'SENSOR02.CSV',
            source_sensor_id: 'SENSOR02',
          }),
        ],
        fiveSecondPolicy,
      ),
    );

    expect(result.issues).toEqual([]);
    expect(result.summary.streamCount).toBe(2);
  });

  it('reports a decreasing timestamp using original input order', () => {
    const result = service.evaluateTimeSeries(
      [
        measurement('rec-later', '2024-09-02T08:00:05+02:00'),
        measurement('rec-earlier', '2024-09-02T08:00:00+02:00'),
      ],
      fiveSecondPolicy,
    );
    const [issue] = issuesWithCode(result, 'OUT_OF_ORDER_TIMESTAMP');

    expect(issue.record_ids).toEqual(['rec-later', 'rec-earlier']);
    expect(issue.context).toEqual({
      previous_record_id: 'rec-later',
      next_record_id: 'rec-earlier',
      previous_timestamp: '2024-09-02T08:00:05+02:00',
      next_timestamp: '2024-09-02T08:00:00+02:00',
    });
  });

  it('does not turn an out-of-order sequence into a false missing issue', () => {
    const result = service.evaluateTimeSeries(
      [
        measurement('rec-1', '2024-09-02T08:00:00+02:00'),
        measurement('rec-3', '2024-09-02T08:00:10+02:00'),
        measurement('rec-2', '2024-09-02T08:00:05+02:00'),
      ],
      fiveSecondPolicy,
    );

    expect(issuesWithCode(result, 'OUT_OF_ORDER_TIMESTAMP')).toHaveLength(1);
    expect(issuesWithCode(result, 'MISSING_INTERVAL')).toHaveLength(0);
  });

  it('does not treat duplicate timestamp delta zero as a missing interval', () => {
    const timestamp = '2024-09-02T08:00:00+02:00';
    const result = service.evaluateTimeSeries(
      [measurement('rec-1', timestamp), measurement('rec-2', timestamp)],
      fiveSecondPolicy,
    );

    expect(issuesWithCode(result, 'DUPLICATE_TIMESTAMP')).toHaveLength(1);
    expect(issuesWithCode(result, 'MISSING_INTERVAL')).toHaveLength(0);
  });

  it('applies tolerance at the expected interval boundary', () => {
    const withinTolerance = requireSuccess(
      service.evaluateTimeSeries(
        [
          measurement('rec-1', '2024-09-02T08:00:00.000+02:00'),
          measurement('rec-2', '2024-09-02T08:00:05.500+02:00'),
        ],
        { expectedIntervalSeconds: 5, toleranceSeconds: 1 },
      ),
    );
    const beyondTolerance = service.evaluateTimeSeries(
      [
        measurement('rec-1', '2024-09-02T08:00:00.000+02:00'),
        measurement('rec-2', '2024-09-02T08:00:10.001+02:00'),
      ],
      { expectedIntervalSeconds: 5, toleranceSeconds: 0 },
    );

    expect(withinTolerance.issues).toEqual([]);
    expect(issuesWithCode(beyondTolerance, 'MISSING_INTERVAL')).toHaveLength(1);
  });

  it.each([
    [{ expectedIntervalSeconds: 0 }, 'expectedIntervalSeconds'],
    [{ expectedIntervalSeconds: -5 }, 'expectedIntervalSeconds'],
    [{ expectedIntervalSeconds: Number.NaN }, 'expectedIntervalSeconds'],
    [{ expectedIntervalSeconds: 5, toleranceSeconds: -1 }, 'toleranceSeconds'],
  ])('returns a structured failure for invalid policy %p', (policy, field) => {
    const result = service.evaluateTimeSeries([], policy);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual([
        expect.objectContaining({ code: 'INVALID_POLICY', field }),
      ]);
    }
  });

  it('does not mutate the input array or canonical measurement content', () => {
    const records = [
      measurement('rec-1', '2024-09-02T08:00:10+02:00'),
      measurement('rec-2', '2024-09-02T08:00:00+02:00'),
    ];
    const before = structuredClone(records);

    service.evaluateTimeSeries(records, fiveSecondPolicy);

    expect(records).toEqual(before);
    expect(records[0]).toMatchObject({
      missing_flag: false,
      duplicate_flag: false,
      conflict_flag: false,
    });
  });

  it('evaluates multiple streams independently and reports correct summary counts', () => {
    const result = requireSuccess(
      service.evaluateTimeSeries(
        [
          measurement('s1-1', '2024-09-02T08:00:00+02:00'),
          measurement('s2-1', '2024-09-02T08:00:00+02:00', {
            source_file: 'SENSOR02.CSV',
            source_sensor_id: 'SENSOR02',
          }),
          measurement('s1-2', '2024-09-02T08:00:10+02:00'),
          measurement('s2-2', '2024-09-02T08:00:00+02:00', {
            source_file: 'SENSOR02.CSV',
            source_sensor_id: 'SENSOR02',
          }),
        ],
        fiveSecondPolicy,
      ),
    );

    expect(result.summary).toMatchObject({
      measurementCount: 4,
      streamCount: 2,
      issueCount: 2,
      missingIntervalCount: 1,
      duplicateTimestampCount: 1,
      outOfOrderCount: 0,
    });
    expect(result.summary.streams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stream: expect.objectContaining({ source_sensor_id: 'SENSOR01' }),
          missingIntervalCount: 1,
          duplicateTimestampCount: 0,
        }),
        expect.objectContaining({
          stream: expect.objectContaining({ source_sensor_id: 'SENSOR02' }),
          missingIntervalCount: 0,
          duplicateTimestampCount: 1,
        }),
      ]),
    );
  });

  it('returns exactly the same result for repeated evaluation', () => {
    const records = [
      measurement('rec-1', '2024-09-02T08:00:10+02:00'),
      measurement('rec-2', '2024-09-02T08:00:00+02:00'),
      measurement('rec-3', '2024-09-02T08:00:00+02:00'),
    ];

    expect(service.evaluateTimeSeries(records, fiveSecondPolicy)).toEqual(
      service.evaluateTimeSeries(records, fiveSecondPolicy),
    );
  });
});

describe('Zenodo adapter, normalization and data-quality integration', () => {
  it('reports no issues for the regular SENSOR06 public-data excerpt', async () => {
    const sourceMetadata: FileMetadata = {
      fileName: 'SENSOR06.CSV',
      dataset: 'ZENODO:10.5281/zenodo.15130001',
      checksumSha256: 'cb4b4b41d04cdd21873975954d629d5248acc21c2d5a5999339ddbe628569955',
      sourceFormat: 'CSV_SEMICOLON',
      measurementOrigin: 'REAL_PUBLIC_DATA',
      mimeType: 'text/csv',
      sourceSensorId: 'SENSOR06',
    };
    const fixture = readFileSync(
      path.resolve(process.cwd(), 'tests/fixtures/zenodo/SENSOR06_excerpt.csv'),
    );
    const adapter = new ZenodoAdapter();
    const normalizer = new NormalizationService();
    const canonical: CanonicalTimeSeriesMeasurement[] = [];

    for await (const parsed of adapter.parse({ metadata: sourceMetadata, content: fixture })) {
      if (parsed.recordType !== 'TIMESERIES') throw new Error('Expected TIMESERIES fixture');
      const normalized = normalizer.normalizeTimeSeries(parsed, {
        parserId: adapter.id,
        parserVersion: adapter.version,
        timezoneOffset: '+02:00',
        timezoneOrigin: 'EXPLICIT_ASSUMPTION',
      });
      if (!normalized.success) throw new Error(JSON.stringify(normalized.errors));
      canonical.push(normalized.measurement);
    }

    const result = requireSuccess(service.evaluateTimeSeries(canonical, fiveSecondPolicy));

    expect(canonical).toHaveLength(3);
    expect(result.issues).toEqual([]);
    expect(result.summary).toMatchObject({
      measurementCount: 3,
      streamCount: 1,
      missingIntervalCount: 0,
      duplicateTimestampCount: 0,
      outOfOrderCount: 0,
    });
    expect(canonical[0]).toMatchObject({
      source_file: 'SENSOR06.CSV',
      source_sensor_id: 'SENSOR06',
      source_row_or_ref: 'row:2',
      parser_id: adapter.id,
      parser_version: adapter.version,
    });
  });
});
