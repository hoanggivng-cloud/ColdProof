import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { SpatialMeasurementSchema } from '@coldproof/canonical-schema';
import type { ParsedSpatialRecord, ParsedTimeSeriesRecord } from '@coldproof/parser-contracts';
import type { ScaffoldStatus } from '@coldproof/shared-types';

import type {
  NormalizationContext,
  NormalizationError,
  NormalizationResult,
  SpatialNormalizationContext,
  SpatialNormalizationResult,
} from './normalization.types';
import { normalizeTimeSeriesRecord } from './time-series-normalization';

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
      message: 'Time-series and spatial normalization are available; import orchestration remains TODO.',
    };
  }

  normalizeTimeSeries(
    record: ParsedTimeSeriesRecord,
    context: NormalizationContext,
  ): NormalizationResult {
    return normalizeTimeSeriesRecord(record, context);
  }

  normalizeSpatial(
    record: ParsedSpatialRecord,
    context: SpatialNormalizationContext,
  ): SpatialNormalizationResult {
    const errors: NormalizationError[] = [];
    const parserId = context.parserId.trim();
    const parserVersion = context.parserVersion.trim();

    if (record.recordType !== 'SPATIAL_SNAPSHOT') {
      errors.push({
        code: 'INVALID_RECORD_TYPE',
        field: 'recordType',
        message: `Expected SPATIAL_SNAPSHOT but received ${String(record.recordType)}`,
      });
    }

    if (parserId === '' || parserVersion === '') {
      errors.push({
        code: 'INVALID_PARSER_IDENTITY',
        field: parserId === '' ? 'parserId' : 'parserVersion',
        message: 'parserId and parserVersion must both be non-empty',
      });
    }

    if (record.conditionId.trim() === '') {
      errors.push({
        code: 'INVALID_CONDITION_ID',
        field: 'conditionId',
        message: 'conditionId must be non-empty',
      });
    }

    const coordinates = [
      ['positionX', record.positionX],
      ['positionY', record.positionY],
      ...(record.positionZ !== undefined ? ([['positionZ', record.positionZ]] as const) : []),
    ] as const;
    for (const [field, value] of coordinates) {
      if (!Number.isFinite(value)) {
        errors.push({
          code: 'INVALID_COORDINATE',
          field,
          message: `${field} must be finite`,
        });
      }
    }

    if (record.temperatureC === undefined || !Number.isFinite(record.temperatureC)) {
      errors.push({
        code: 'INVALID_TEMPERATURE',
        field: 'temperatureC',
        message: 'A finite temperatureC is required for a spatial measurement',
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

    const candidate = {
      record_id: deterministicRecordId(
        record.sourceMetadata.checksumSha256,
        record.rawRef,
        parserId,
        parserVersion,
      ),
      record_type: 'SPATIAL_SNAPSHOT' as const,
      condition_id: record.conditionId,
      position_x: record.positionX,
      position_y: record.positionY,
      ...(record.positionZ !== undefined ? { position_z: record.positionZ } : {}),
      temperature_c: record.temperatureC,
      source_dataset: record.sourceMetadata.dataset,
      source_file: record.sourceMetadata.fileName,
      source_row_or_ref: record.rawRef,
      source_checksum_sha256: record.sourceMetadata.checksumSha256,
      source_format: record.sourceMetadata.sourceFormat,
      parser_id: parserId,
      parser_version: parserVersion,
      measurement_origin: record.sourceMetadata.measurementOrigin,
    };
    const validation = SpatialMeasurementSchema.safeParse(candidate);

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

    return {
      success: true,
      measurement: validation.data,
      appliedContext: { parserId, parserVersion },
    };
  }
}
