import { SpatialMeasurementSchema } from '@coldproof/canonical-schema';
import type { FileMetadata, ParsedSpatialRecord } from '@coldproof/parser-contracts';

import { workbookFixture } from '../../../../tests/fixtures/mendeley/workbook-fixture';
import { MendeleyAdapter } from '../adapters/mendeley/mendeley.adapter';
import { NormalizationService } from './normalization.service';
import type {
  SpatialNormalizationContext,
  SpatialNormalizationResult,
} from './normalization.types';

const sourceMetadata: FileMetadata = {
  fileName: 'C01 Synthetic Test Condition.xlsx',
  dataset: 'MENDELEY:sz5dgkz7k8:v1',
  checksumSha256: 'd'.repeat(64),
  sourceFormat: 'XLSX',
  measurementOrigin: 'REAL_PUBLIC_DATA',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const parsedRecord: ParsedSpatialRecord = {
  recordType: 'SPATIAL_SNAPSHOT',
  rawRef: 'sheet:Feuil1:cell:B8',
  conditionId: 'C01',
  positionX: 250,
  positionY: 0,
  positionZ: 20,
  temperatureRaw: '5.25',
  temperatureC: 5.25,
  sourceMetadata,
  warnings: [],
};

const context: SpatialNormalizationContext = {
  parserId: 'mendeley-insulated-box',
  parserVersion: '1.0.0',
};

const service = new NormalizationService();

function requireSuccess(result: SpatialNormalizationResult) {
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result;
}

function errorCodes(result: SpatialNormalizationResult): string[] {
  return result.success ? [] : result.errors.map((error) => error.code);
}

describe('NormalizationService.normalizeSpatial', () => {
  it('maps a valid parsed spatial record to canonical fields and provenance', () => {
    const result = requireSuccess(service.normalizeSpatial(parsedRecord, context));

    expect(result.measurement).toEqual({
      record_id: expect.stringMatching(/^rec_[a-f0-9]{64}$/),
      record_type: 'SPATIAL_SNAPSHOT',
      condition_id: 'C01',
      position_x: 250,
      position_y: 0,
      position_z: 20,
      temperature_c: 5.25,
      source_dataset: sourceMetadata.dataset,
      source_file: sourceMetadata.fileName,
      source_row_or_ref: parsedRecord.rawRef,
      source_checksum_sha256: sourceMetadata.checksumSha256,
      source_format: sourceMetadata.sourceFormat,
      parser_id: context.parserId,
      parser_version: context.parserVersion,
      measurement_origin: sourceMetadata.measurementOrigin,
    });
    expect(result.appliedContext).toEqual(context);
  });

  it('produces output accepted by SpatialMeasurementSchema', () => {
    const result = requireSuccess(service.normalizeSpatial(parsedRecord, context));

    expect(SpatialMeasurementSchema.safeParse(result.measurement).success).toBe(true);
  });

  it('allows positionZ to remain absent without fabricating it', () => {
    const { positionZ: _positionZ, ...withoutPositionZ } = parsedRecord;
    const result = requireSuccess(service.normalizeSpatial(withoutPositionZ, context));

    expect(result.measurement).not.toHaveProperty('position_z');
  });

  it('generates the same deterministic record ID from stable provenance', () => {
    const first = requireSuccess(service.normalizeSpatial(parsedRecord, context));
    const second = requireSuccess(service.normalizeSpatial(parsedRecord, context));

    expect(second.measurement.record_id).toBe(first.measurement.record_id);
  });

  it('generates a different record ID when rawRef changes', () => {
    const first = requireSuccess(service.normalizeSpatial(parsedRecord, context));
    const second = requireSuccess(
      service.normalizeSpatial({ ...parsedRecord, rawRef: 'sheet:Feuil1:cell:C8' }, context),
    );

    expect(second.measurement.record_id).not.toBe(first.measurement.record_id);
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])(
    'fails for invalid or missing temperature: %s',
    (temperatureC) => {
      const record = { ...parsedRecord, temperatureC } as ParsedSpatialRecord;
      const result = service.normalizeSpatial(record, context);

      expect(errorCodes(result)).toContain('INVALID_TEMPERATURE');
    },
  );

  it.each([
    ['positionX', undefined],
    ['positionX', Number.NaN],
    ['positionY', Number.POSITIVE_INFINITY],
    ['positionZ', Number.NEGATIVE_INFINITY],
  ] as const)('fails for invalid or missing coordinate %s=%s', (field, value) => {
    const record = { ...parsedRecord, [field]: value } as ParsedSpatialRecord;
    const result = service.normalizeSpatial(record, context);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'INVALID_COORDINATE', field }),
        ]),
      );
    }
  });

  it('returns a structured failure for an empty condition ID', () => {
    const result = service.normalizeSpatial({ ...parsedRecord, conditionId: ' ' }, context);

    expect(errorCodes(result)).toContain('INVALID_CONDITION_ID');
  });

  it('rejects parser warnings instead of silently canonicalizing them', () => {
    const warning = 'SOURCE_VALUE_REQUIRES_REVIEW';
    const result = service.normalizeSpatial(
      { ...parsedRecord, warnings: [warning] },
      context,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual([
        expect.objectContaining({
          code: 'PARSER_WARNING',
          field: 'warnings',
          parserWarning: warning,
        }),
      ]);
    }
  });

  it.each([
    [{ ...context, parserId: ' ' }, 'parserId'],
    [{ ...context, parserVersion: '' }, 'parserVersion'],
  ])('requires explicit parser identity: %p', (invalidContext, field) => {
    const result = service.normalizeSpatial(parsedRecord, invalidContext);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'INVALID_PARSER_IDENTITY', field }),
        ]),
      );
    }
  });

  it('returns canonical validation errors for invalid source provenance', () => {
    const result = service.normalizeSpatial(
      {
        ...parsedRecord,
        sourceMetadata: { ...sourceMetadata, checksumSha256: 'not-a-checksum' },
      },
      context,
    );

    expect(errorCodes(result)).toContain('CANONICAL_VALIDATION_FAILED');
  });

  it('does not generate temporal or business enrichment fields', () => {
    const result = requireSuccess(service.normalizeSpatial(parsedRecord, context));

    expect(result.measurement).not.toHaveProperty('timestamp');
    expect(result.measurement).not.toHaveProperty('timezone');
    expect(result.measurement).not.toHaveProperty('duration');
    expect(result.measurement).not.toHaveProperty('scenario_id');
    expect(result.measurement).not.toHaveProperty('batch_id');
    expect(result.measurement).not.toHaveProperty('excursion_flag');
  });
});

describe('Mendeley adapter to spatial normalization integration', () => {
  it('preserves physical workbook-cell provenance through the fixture pipeline', async () => {
    const adapter = new MendeleyAdapter();
    const measurements = [];

    for await (const record of adapter.parse({
      metadata: sourceMetadata,
      content: workbookFixture(),
    })) {
      const result = service.normalizeSpatial(record, {
        parserId: adapter.id,
        parserVersion: adapter.version,
      });
      measurements.push(requireSuccess(result).measurement);
    }

    expect(measurements).toHaveLength(3);
    expect(measurements[0]).toMatchObject({
      record_type: 'SPATIAL_SNAPSHOT',
      condition_id: 'C01',
      position_x: 250,
      position_y: 0,
      position_z: 20,
      temperature_c: 5.25,
      source_file: sourceMetadata.fileName,
      source_row_or_ref: 'sheet:Feuil1:cell:B8',
      source_checksum_sha256: sourceMetadata.checksumSha256,
      parser_id: adapter.id,
      parser_version: adapter.version,
    });
    expect(measurements.every((measurement) => !('timestamp' in measurement))).toBe(true);
  });
});
