import { readFileSync } from 'node:fs';
import path from 'node:path';

import { CanonicalTimeSeriesMeasurementSchema } from '@coldproof/canonical-schema';
import type { FileMetadata, ParsedTimeSeriesRecord } from '@coldproof/parser-contracts';

import { ZenodoAdapter } from '../adapters/zenodo/zenodo.adapter';
import { NormalizationService } from './normalization.service';
import type {
  NormalizationContext,
  NormalizationResult,
} from './normalization.types';

const sourceMetadata: FileMetadata = {
  fileName: 'SENSOR06.CSV',
  dataset: 'ZENODO:10.5281/zenodo.15130001',
  checksumSha256: 'cb4b4b41d04cdd21873975954d629d5248acc21c2d5a5999339ddbe628569955',
  sourceFormat: 'CSV_SEMICOLON',
  measurementOrigin: 'REAL_PUBLIC_DATA',
  mimeType: 'text/csv',
  sourceSensorId: 'SENSOR06',
};

const parsedRecord: ParsedTimeSeriesRecord = {
  recordType: 'TIMESERIES',
  rawRef: 'row:2',
  timestampRaw: '02.09.2024;09:31:55',
  timestamp: '2024-09-02T09:31:55',
  temperatureRaw: '21.50',
  temperatureC: 21.5,
  humidityPct: 60.1,
  sourceMetadata,
  warnings: [],
};

const context: NormalizationContext = {
  parserId: 'zenodo-cold-storage',
  parserVersion: '1.0.0',
  timezoneOffset: '+02:00',
  timezoneOrigin: 'EXPLICIT_ASSUMPTION',
};

const service = new NormalizationService();

function requireSuccess(result: NormalizationResult) {
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result;
}

function errorCodes(result: NormalizationResult): string[] {
  return result.success ? [] : result.errors.map((error) => error.code);
}

describe('NormalizationService.normalizeTimeSeries', () => {
  it('maps a valid parsed record to a canonical time-series measurement', () => {
    const result = requireSuccess(service.normalizeTimeSeries(parsedRecord, context));

    expect(result.measurement).toMatchObject({
      record_type: 'TIMESERIES',
      timestamp: '2024-09-02T09:31:55+02:00',
      temperature_c: 21.5,
      humidity_pct: 60.1,
      source_dataset: sourceMetadata.dataset,
      source_file: sourceMetadata.fileName,
      source_sensor_id: sourceMetadata.sourceSensorId,
      source_row_or_ref: 'row:2',
      source_checksum_sha256: sourceMetadata.checksumSha256,
      source_format: sourceMetadata.sourceFormat,
      parser_id: context.parserId,
      parser_version: context.parserVersion,
      measurement_origin: 'REAL_PUBLIC_DATA',
      missing_flag: false,
      duplicate_flag: false,
      conflict_flag: false,
    });
  });

  it('returns the explicit timezone assumption in applied context', () => {
    const result = requireSuccess(service.normalizeTimeSeries(parsedRecord, context));

    expect(result.appliedContext).toEqual(context);
  });

  it('generates the same deterministic record ID for the same provenance', () => {
    const first = requireSuccess(service.normalizeTimeSeries(parsedRecord, context));
    const second = requireSuccess(service.normalizeTimeSeries(parsedRecord, context));

    expect(first.measurement.record_id).toMatch(/^rec_[a-f0-9]{64}$/);
    expect(second.measurement.record_id).toBe(first.measurement.record_id);
  });

  it('generates a different record ID when rawRef changes', () => {
    const first = requireSuccess(service.normalizeTimeSeries(parsedRecord, context));
    const second = requireSuccess(
      service.normalizeTimeSeries({ ...parsedRecord, rawRef: 'row:3' }, context),
    );

    expect(second.measurement.record_id).not.toBe(first.measurement.record_id);
  });

  it.each([
    [{ ...context, timezoneOffset: undefined }, 'timezoneOffset'],
    [{ ...context, timezoneOrigin: undefined }, 'timezoneOrigin'],
  ])('fails when timezone context is missing: %s', (incompleteContext, field) => {
    const result = service.normalizeTimeSeries(parsedRecord, incompleteContext);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'MISSING_TIMEZONE_CONTEXT', field }),
        ]),
      );
    }
  });

  it.each(['+25:00', '+07:99', 'ABC', 'Z'])('rejects invalid timezone offset %s', (offset) => {
    const result = service.normalizeTimeSeries(parsedRecord, {
      ...context,
      timezoneOffset: offset,
    });

    expect(errorCodes(result)).toContain('INVALID_TIMEZONE_OFFSET');
  });

  it('rejects an unsupported timezone origin', () => {
    const result = service.normalizeTimeSeries(parsedRecord, {
      ...context,
      timezoneOrigin: 'INFERRED' as NormalizationContext['timezoneOrigin'],
    });

    expect(errorCodes(result)).toContain('INVALID_TIMEZONE_ORIGIN');
  });

  it('does not add Z or default a timezone', () => {
    const success = requireSuccess(service.normalizeTimeSeries(parsedRecord, context));
    const missingContext = service.normalizeTimeSeries(parsedRecord, {
      ...context,
      timezoneOffset: undefined,
    });

    expect(success.measurement.timestamp).toBe('2024-09-02T09:31:55+02:00');
    expect(success.measurement.timestamp).not.toMatch(/Z$/);
    expect(missingContext.success).toBe(false);
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    'fails rather than marking invalid temperature as missing: %s',
    (temperatureC) => {
      const result = service.normalizeTimeSeries({ ...parsedRecord, temperatureC }, context);

      expect(errorCodes(result)).toContain('INVALID_TEMPERATURE');
    },
  );

  it('preserves valid temperature and humidity', () => {
    const result = requireSuccess(service.normalizeTimeSeries(parsedRecord, context));

    expect(result.measurement.temperature_c).toBe(21.5);
    expect(result.measurement.humidity_pct).toBe(60.1);
  });

  it('allows absent humidity when the parser reported no warning', () => {
    const { humidityPct: _humidity, ...withoutHumidity } = parsedRecord;
    const result = requireSuccess(service.normalizeTimeSeries(withoutHumidity, context));

    expect(result.measurement).not.toHaveProperty('humidity_pct');
  });

  it('rejects non-finite humidity', () => {
    const result = service.normalizeTimeSeries(
      { ...parsedRecord, humidityPct: Number.NaN },
      context,
    );

    expect(errorCodes(result)).toContain('INVALID_HUMIDITY');
  });

  it('preserves checksum, source sensor and measurement origin', () => {
    const result = requireSuccess(service.normalizeTimeSeries(parsedRecord, context));

    expect(result.measurement.source_checksum_sha256).toBe(sourceMetadata.checksumSha256);
    expect(result.measurement.source_sensor_id).toBe('SENSOR06');
    expect(result.measurement.measurement_origin).toBe('REAL_PUBLIC_DATA');
  });

  it('fails when source sensor provenance is absent', () => {
    const result = service.normalizeTimeSeries(
      {
        ...parsedRecord,
        sourceMetadata: { ...sourceMetadata, sourceSensorId: undefined },
      },
      context,
    );

    expect(errorCodes(result)).toContain('MISSING_SOURCE_SENSOR_ID');
  });

  it('fails explicitly instead of ignoring parser warnings', () => {
    const warning = 'INVALID_TEMPERATURE: "not-a-number"';
    const result = service.normalizeTimeSeries(
      { ...parsedRecord, temperatureC: undefined, warnings: [warning] },
      context,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'PARSER_WARNING', parserWarning: warning }),
          expect.objectContaining({ code: 'INVALID_TEMPERATURE' }),
        ]),
      );
    }
  });

  it.each(['2024-02-30T09:31:55', '2024-09-02T24:00:00', '02.09.2024;09:31:55'])(
    'rejects invalid or non-normalized parsed timestamp %s',
    (timestamp) => {
      const result = service.normalizeTimeSeries({ ...parsedRecord, timestamp }, context);

      expect(errorCodes(result)).toContain('INVALID_PARSED_TIMESTAMP');
    },
  );

  it('returns canonical validation failures for invalid source provenance', () => {
    const result = service.normalizeTimeSeries(
      {
        ...parsedRecord,
        sourceMetadata: { ...sourceMetadata, checksumSha256: 'NOT-A-SHA256' },
      },
      context,
    );

    expect(errorCodes(result)).toContain('CANONICAL_VALIDATION_FAILED');
  });

  it('produces output accepted by CanonicalTimeSeriesMeasurementSchema', () => {
    const result = requireSuccess(service.normalizeTimeSeries(parsedRecord, context));

    expect(CanonicalTimeSeriesMeasurementSchema.safeParse(result.measurement).success).toBe(true);
  });

  it('does not add business enrichment fields to core output', () => {
    const result = requireSuccess(service.normalizeTimeSeries(parsedRecord, context));

    expect(result.measurement).not.toHaveProperty('scenario_id');
    expect(result.measurement).not.toHaveProperty('batch_id');
    expect(result.measurement).not.toHaveProperty('business_context_origin');
    expect(result.measurement).not.toHaveProperty('profile_id');
    expect(result.measurement).not.toHaveProperty('excursion_flag');
  });
});

describe('Zenodo adapter to normalization integration', () => {
  it('preserves source-row provenance through the full fixture pipeline', async () => {
    const fixture = readFileSync(
      path.resolve(process.cwd(), 'tests/fixtures/zenodo/SENSOR06_excerpt.csv'),
    );
    const adapter = new ZenodoAdapter();
    const normalized: NormalizationResult[] = [];

    for await (const record of adapter.parse({ metadata: sourceMetadata, content: fixture })) {
      normalized.push(
        service.normalizeTimeSeries(record, {
          parserId: adapter.id,
          parserVersion: adapter.version,
          timezoneOffset: '+02:00',
          timezoneOrigin: 'EXPLICIT_ASSUMPTION',
        }),
      );
    }

    expect(normalized).toHaveLength(3);
    expect(normalized.every((result) => result.success)).toBe(true);

    const first = requireSuccess(normalized[0]);
    expect(first.measurement).toMatchObject({
      timestamp: '2024-09-02T09:31:55+02:00',
      temperature_c: 21.5,
      humidity_pct: 60.1,
      source_file: 'SENSOR06.CSV',
      source_sensor_id: 'SENSOR06',
      source_row_or_ref: 'row:2',
      source_checksum_sha256: sourceMetadata.checksumSha256,
      parser_id: adapter.id,
      parser_version: adapter.version,
    });
    expect(first.appliedContext.timezoneOrigin).toBe('EXPLICIT_ASSUMPTION');
  });
});
