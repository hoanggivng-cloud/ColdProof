import { z } from 'zod';

export const RecordType = z.enum(['TIMESERIES', 'SPATIAL_SNAPSHOT']);
export type RecordType = z.infer<typeof RecordType>;

export const MeasurementOrigin = z.enum(['REAL_PUBLIC_DATA', 'DERIVED', 'SYNTHETIC']);
export type MeasurementOrigin = z.infer<typeof MeasurementOrigin>;

export const BusinessContextOrigin = z.enum(['REAL', 'SYNTHETIC']);
export type BusinessContextOrigin = z.infer<typeof BusinessContextOrigin>;

const text = z.string().min(1);
const checksumSha256 = z.string().regex(/^[a-f0-9]{64}$/, 'Expected lowercase SHA-256');

const sourceProvenanceShape = {
  source_dataset: text,
  source_file: text,
  source_row_or_ref: text,
  source_checksum_sha256: checksumSha256,
  source_format: text,
  parser_id: text,
  parser_version: text,
  measurement_origin: MeasurementOrigin,
};

const canonicalTimeSeriesShape = {
  record_id: text,
  record_type: z.literal(RecordType.enum.TIMESERIES),
  raw_ingest_id: text.optional(),
  timestamp: z.string().datetime({ offset: true }),
  temperature_c: z.number().finite().optional(),
  humidity_pct: z.number().min(0).max(100).optional(),
  ...sourceProvenanceShape,
  source_sensor_id: text,
  missing_flag: z.boolean(),
  duplicate_flag: z.boolean(),
  conflict_flag: z.boolean(),
  data_quality_code: text.optional(),
};

type MissingMeasurement = {
  missing_flag: boolean;
  temperature_c?: number;
};

function requireTemperatureWhenPresent(value: MissingMeasurement, context: z.RefinementCtx) {
  if (!value.missing_flag && value.temperature_c === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'temperature_c is required when missing_flag is false',
      path: ['temperature_c'],
    });
  }
}

/** Core time-series measurement owned by Data Engineering. */
export const CanonicalTimeSeriesMeasurementSchema = z
  .object(canonicalTimeSeriesShape)
  .strict()
  .superRefine(requireTemperatureWhenPresent);
export type CanonicalTimeSeriesMeasurement = z.infer<
  typeof CanonicalTimeSeriesMeasurementSchema
>;

/**
 * Compatibility alias preserving the original package export name.
 * CanonicalMeasurement now means the core TIMESERIES data contract only.
 */
export const CanonicalMeasurementSchema = CanonicalTimeSeriesMeasurementSchema;
export type CanonicalMeasurement = CanonicalTimeSeriesMeasurement;

/** Spatial snapshot measurement owned by Data Engineering; no timestamp semantics. */
export const SpatialMeasurementSchema = z
  .object({
    record_id: text,
    record_type: z.literal(RecordType.enum.SPATIAL_SNAPSHOT),
    condition_id: text,
    position_x: z.number().finite(),
    position_y: z.number().finite(),
    position_z: z.number().finite().optional(),
    temperature_c: z.number().finite(),
    ...sourceProvenanceShape,
  })
  .strict();
export type SpatialMeasurement = z.infer<typeof SpatialMeasurementSchema>;

export const CanonicalSourceMeasurementSchema = z.union([
  CanonicalTimeSeriesMeasurementSchema,
  SpatialMeasurementSchema,
]);
export type CanonicalSourceMeasurement = z.infer<typeof CanonicalSourceMeasurementSchema>;

/** Backend/business workflow enrichment; these fields are not source provenance. */
export const BusinessEnrichedMeasurementSchema = z
  .object({
    ...canonicalTimeSeriesShape,
    scenario_id: text.optional(),
    batch_id: text.optional(),
    segment_id: text.optional(),
    business_context_origin: BusinessContextOrigin,
    profile_id: text.optional(),
    lower_threshold: z.number().finite().optional(),
    upper_threshold: z.number().finite().optional(),
    excursion_flag: z.boolean().optional(),
    exception_id: text.optional(),
    review_status: z.enum(['PENDING', 'REVIEWED', 'NEEDS_EVIDENCE']).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    requireTemperatureWhenPresent(value, context);
    if (
      value.lower_threshold !== undefined &&
      value.upper_threshold !== undefined &&
      value.lower_threshold > value.upper_threshold
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid threshold range',
        path: ['lower_threshold'],
      });
    }
  });
export type BusinessEnrichedMeasurement = z.infer<typeof BusinessEnrichedMeasurementSchema>;
