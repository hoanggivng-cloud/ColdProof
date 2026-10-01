import { z } from 'zod';
export const MeasurementOrigin = z.enum(['REAL_PUBLIC_DATA', 'DERIVED', 'SYNTHETIC']);
export type MeasurementOrigin = z.infer<typeof MeasurementOrigin>;
export const BusinessContextOrigin = z.enum(['REAL', 'SYNTHETIC']);
export type BusinessContextOrigin = z.infer<typeof BusinessContextOrigin>;
const text = z.string().min(1);
export const CanonicalMeasurementSchema = z.object({
  record_id: text, scenario_id: text.optional(), batch_id: text.optional(), segment_id: text.optional(),
  timestamp: z.string().datetime({ offset: true }).optional(),
  temperature_c: z.number().finite().optional(), humidity_pct: z.number().min(0).max(100).optional(),
  source_dataset: text, source_file: text, source_sensor_id: text.optional(), source_row_or_ref: text,
  source_checksum_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  source_format: text, parser_id: text, parser_version: text,
  measurement_origin: MeasurementOrigin, business_context_origin: BusinessContextOrigin,
  missing_flag: z.boolean(), duplicate_flag: z.boolean(), conflict_flag: z.boolean(), data_quality_code: text.optional(),
  profile_id: text.optional(), lower_threshold: z.number().finite().optional(), upper_threshold: z.number().finite().optional(),
  excursion_flag: z.boolean().optional(), exception_id: text.optional(),
  review_status: z.enum(['PENDING', 'REVIEWED', 'NEEDS_EVIDENCE']).optional(),
}).strict().refine(v => v.lower_threshold === undefined || v.upper_threshold === undefined || v.lower_threshold <= v.upper_threshold, { message: 'Invalid threshold range' });
export type CanonicalMeasurement = z.infer<typeof CanonicalMeasurementSchema>;

// Spatial experimental snapshots are deliberately separate from time-series.
export const SpatialMeasurementSchema = z.object({
  record_id: text, source_dataset: text, source_file: text, source_row_or_ref: text,
  measurement_origin: MeasurementOrigin, parser_id: text, parser_version: text,
  condition_id: text, position_x: z.number().finite(), position_y: z.number().finite(),
  position_z: z.number().finite().optional(), temperature_c: z.number().finite(),
}).strict();
export type SpatialMeasurement = z.infer<typeof SpatialMeasurementSchema>;
