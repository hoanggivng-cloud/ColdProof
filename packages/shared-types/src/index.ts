import { CanonicalTimeSeriesMeasurementSchema } from '@coldproof/canonical-schema';
import {
  LoggerTimezoneResolutionSchema,
  RawIngestRecordSchema,
} from '@coldproof/parser-contracts';
import { z } from 'zod';

export const IMPORT_STATUSES = ['QUEUED', 'PARSING', 'NORMALIZING', 'QUALITY_CHECK', 'COMPLETE', 'FAILED'] as const;
export type ImportStatus = typeof IMPORT_STATUSES[number];
export interface ScaffoldStatus { module: string; status: 'TODO'; message: string }
export type QualityIssueCode =
  | 'MISSING_INTERVAL'
  | 'DUPLICATE_TIMESTAMP'
  | 'OUT_OF_ORDER_TIMESTAMP'
  | 'SENSOR_CONFLICT'
  | 'INVALID_VALUE';
export interface QualityIssue { id: string; record_ids: string[]; code: QualityIssueCode; detail: string }
export interface ExceptionCandidate { id: string; batch_id: string; record_ids: string[]; profile_id: string }
export interface EvidencePackage { id: string; version: number; source_ids: string[]; checksums: string[]; transformation_refs: string[] }
export type Role = 'ADMIN' | 'OPERATOR' | 'DATA_ENGINEER' | 'QA_REVIEWER' | 'VIEWER';

const nonEmptyText = z.string().min(1);

export const TripAssociationMethod = z.enum([
  'DEVICE_TIME_WINDOW',
  'MANUAL_QA',
  'IMPORT_CONTEXT',
]);
export type TripAssociationMethod = z.infer<typeof TripAssociationMethod>;

export const TripAssociationStatus = z.enum(['UNASSIGNED', 'ASSIGNED']);
export type TripAssociationStatus = z.infer<typeof TripAssociationStatus>;

export const TripAssociationOrigin = z.enum([
  'OPERATIONAL_RUNTIME',
  'SYNTHETIC_DEMO_CONTEXT',
]);
export type TripAssociationOrigin = z.infer<typeof TripAssociationOrigin>;

export const TripAssociationProvenanceSchema = z
  .object({
    origin: TripAssociationOrigin,
    resolver_id: nonEmptyText,
    resolver_version: nonEmptyText,
  })
  .strict();
export type TripAssociationProvenance = z.infer<
  typeof TripAssociationProvenanceSchema
>;

/**
 * Integration metadata stating whether and how an existing canonical record
 * is associated with a trip. It contains references, not physical values.
 */
export const TripMeasurementAssociationSchema = z
  .object({
    canonical_record_id: nonEmptyText,
    raw_ingest_id: nonEmptyText,
    source_sensor_id: nonEmptyText,
    observed_at: z.string().datetime({ offset: true }),
    association_status: TripAssociationStatus,
    trip_id: nonEmptyText.optional(),
    association_method: TripAssociationMethod.optional(),
    association_provenance: TripAssociationProvenanceSchema,
  })
  .strict()
  .superRefine((association, context) => {
    if (association.association_status === 'ASSIGNED') {
      if (association.trip_id === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'trip_id is required when association_status is ASSIGNED',
          path: ['trip_id'],
        });
      }
      if (association.association_method === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'association_method is required when association_status is ASSIGNED',
          path: ['association_method'],
        });
      }
      return;
    }

    if (association.trip_id !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'trip_id must be absent when association_status is UNASSIGNED',
        path: ['trip_id'],
      });
    }
    if (association.association_method !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'association_method must be absent when association_status is UNASSIGNED',
        path: ['association_method'],
      });
    }
  });
export type TripMeasurementAssociation = z.infer<
  typeof TripMeasurementAssociationSchema
>;

export const QAComparisonAssessmentStatus = z.enum([
  'NOT_ASSESSED',
  'PASS',
  'FLAGGED',
]);
export type QAComparisonAssessmentStatus = z.infer<
  typeof QAComparisonAssessmentStatus
>;

export const QADataQualityFindingSchema = z
  .object({
    finding_id: nonEmptyText,
    code: z.enum([
      'DUPLICATE_RECORD',
      'CONFLICTING_RECORD',
      'OUT_OF_ORDER_RECORD',
      'MISSING_INTERVAL',
    ]),
    record_ids: z.array(nonEmptyText).min(1),
    evidence: z.unknown(),
  })
  .strict();
export type QADataQualityFinding = z.infer<
  typeof QADataQualityFindingSchema
>;

export const QADataQualityProjectionSchema = z
  .object({
    assessment_status: QAComparisonAssessmentStatus,
    policy_id: nonEmptyText.optional(),
    finding_ids: z.array(nonEmptyText),
    findings: z.array(QADataQualityFindingSchema),
  })
  .strict()
  .superRefine((assessment, context) => {
    const uniqueFindingIds = new Set(assessment.finding_ids);
    if (uniqueFindingIds.size !== assessment.finding_ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'finding_ids must be unique',
        path: ['finding_ids'],
      });
    }

    const projectedFindingIds = assessment.findings.map(
      (finding) => finding.finding_id,
    );
    if (
      projectedFindingIds.length !== assessment.finding_ids.length ||
      projectedFindingIds.some(
        (findingId, index) => findingId !== assessment.finding_ids[index],
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'finding_ids must exactly match findings in stable order',
        path: ['finding_ids'],
      });
    }

    if (assessment.assessment_status === 'NOT_ASSESSED') {
      if (assessment.findings.length > 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'NOT_ASSESSED cannot contain findings',
          path: ['findings'],
        });
      }
      return;
    }

    if (assessment.policy_id === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'policy_id is required for PASS or FLAGGED assessment',
        path: ['policy_id'],
      });
    }
    if (
      assessment.assessment_status === 'PASS' &&
      assessment.findings.length > 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'PASS cannot contain findings',
        path: ['findings'],
      });
    }
    if (
      assessment.assessment_status === 'FLAGGED' &&
      assessment.findings.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'FLAGGED requires at least one finding',
        path: ['findings'],
      });
    }
  });
export type QADataQualityProjection = z.infer<
  typeof QADataQualityProjectionSchema
>;

export const QAComparisonRecordSchema = z
  .object({
    projection_version: z.literal('qa-comparison-v1'),
    raw: RawIngestRecordSchema,
    canonical: CanonicalTimeSeriesMeasurementSchema,
    normalization: z
      .object({
        timezone_resolution: LoggerTimezoneResolutionSchema,
        normalization_notes: z.array(nonEmptyText),
      })
      .strict(),
    data_quality: QADataQualityProjectionSchema,
    trip_association: TripMeasurementAssociationSchema,
  })
  .strict()
  .superRefine((comparison, context) => {
    const canonical = comparison.canonical;
    const association = comparison.trip_association;

    if (canonical.raw_ingest_id !== comparison.raw.ingest_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'canonical.raw_ingest_id must match raw.ingest_id',
        path: ['canonical', 'raw_ingest_id'],
      });
    }
    if (canonical.source_checksum_sha256 !== comparison.raw.content_checksum_sha256) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'canonical source checksum must match the raw payload checksum',
        path: ['canonical', 'source_checksum_sha256'],
      });
    }
    if (canonical.source_format !== comparison.raw.source_format) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'canonical source_format must match raw source_format',
        path: ['canonical', 'source_format'],
      });
    }
    if (association.canonical_record_id !== canonical.record_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'trip association canonical_record_id must match canonical.record_id',
        path: ['trip_association', 'canonical_record_id'],
      });
    }
    if (association.raw_ingest_id !== comparison.raw.ingest_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'trip association raw_ingest_id must match raw.ingest_id',
        path: ['trip_association', 'raw_ingest_id'],
      });
    }
    if (association.source_sensor_id !== canonical.source_sensor_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'trip association source_sensor_id must match canonical source_sensor_id',
        path: ['trip_association', 'source_sensor_id'],
      });
    }
    if (association.observed_at !== canonical.timestamp) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'trip association observed_at must match canonical timestamp',
        path: ['trip_association', 'observed_at'],
      });
    }
    for (let index = 0; index < comparison.data_quality.findings.length; index += 1) {
      if (
        !comparison.data_quality.findings[index].record_ids.includes(
          canonical.record_id,
        )
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'every projected DQ finding must reference canonical.record_id',
          path: ['data_quality', 'findings', index, 'record_ids'],
        });
      }
    }
  });
export type QAComparisonRecord = z.infer<typeof QAComparisonRecordSchema>;
