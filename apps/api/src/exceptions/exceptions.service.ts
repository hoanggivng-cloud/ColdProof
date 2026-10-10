import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ReviewActionDto } from './exceptions.dto';
import {
  detectExcursions,
  detectSensorConflicts,
  ProductProfile,
  EngineMeasurement,
} from './exception-engine';

@Injectable()
export class ExceptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async status() {
    const totalExceptions = await this.prisma.exception.count();
    const pendingReviews = await this.prisma.exception.count({
      where: { status: 'PENDING_REVIEW' },
    });
    return {
      module: 'exceptions',
      status: 'READY',
      message: `Exception engine active. ${totalExceptions} exceptions registered (${pendingReviews} pending human review).`,
    };
  }

  async findAll() {
    return await this.prisma.exception.findMany({
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: string) {
    const exception = await this.prisma.exception.findUnique({
      where: { id },
    });
    if (!exception) {
      throw new NotFoundException(`Exception with ID ${id} not found`);
    }
    return exception;
  }

  async review(id: string, dto: ReviewActionDto) {
    await this.findOne(id);

    if (!dto.notes?.trim() && !dto.justification?.trim()) throw new BadRequestException('Cần nhập ghi chú QA');
    const reviewerId = dto.reviewer_id ?? '00000000-0000-0000-0000-000000000003';
    const effectiveStatus = dto.status ?? (dto.action === 'FLAG_FOR_DISPOSITION' ? 'REVIEWED' : dto.action) ?? 'REVIEWED';
    const effectiveNotes = dto.notes ?? dto.justification ?? null;

    return this.prisma.$transaction(async tx => {
    // Create review entry
    const review = await tx.review.create({
      data: {
        exception_id: id,
        reviewer_id: reviewerId,
        status: effectiveStatus,
        notes: effectiveNotes,
      },
    });

    // Update exception status
    await tx.exception.update({
      where: { id },
      data: { status: effectiveStatus },
    });

    // Append immutable audit event
    await tx.auditEvent.create({
      data: {
        actor_id: reviewerId,
        action: 'QA_REVIEW_ACTION',
        entity_type: 'exceptions',
        entity_id: id,
        payload: {
          status: effectiveStatus,
          action: dto.action,
          reviewer_id: reviewerId,
          notes: effectiveNotes,
          corrective_action: dto.corrective_action,
        },
      },
    });

    return {
      id: review.id,
      exception_id: id,
      reviewer_id: reviewerId,
      status: effectiveStatus,
      notes: effectiveNotes,
      created_at: review.created_at,
    };
    });
  }

  /**
   * Scan batch measurements for excursions and sensor conflicts.
   * Persists results to DB and logs audit events.
   */
  async scanBatch(batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} not found`);
    }

    const profile: ProductProfile = {
      id: batch.profile_id ?? 'DEMO_2_8C',
      lower_threshold: batch.lower_threshold ?? 2.0,
      upper_threshold: batch.upper_threshold ?? 8.0,
    };

    const rawMeasurements = await this.prisma.measurement.findMany({
      where: { batch_id: batchId },
      orderBy: { timestamp: 'asc' },
    });

    // Cast measurements to EngineMeasurement format
    const measurements: EngineMeasurement[] = rawMeasurements.map(m => ({
      record_id: m.record_id,
      record_type: 'TIMESERIES' as const,
      scenario_id: m.scenario_id ?? undefined,
      batch_id: m.batch_id ?? undefined,
      segment_id: m.segment_id ?? undefined,
      timestamp: m.timestamp ? m.timestamp.toISOString() : undefined,
      temperature_c: m.temperature_c ?? undefined,
      humidity_pct: m.humidity_pct ?? undefined,
      source_dataset: m.source_dataset,
      source_file: m.source_file,
      source_sensor_id: m.source_sensor_id ?? 'UNKNOWN',
      source_row_or_ref: m.source_row_or_ref,
      source_checksum_sha256: m.source_checksum_sha256,
      source_format: m.source_format,
      parser_id: m.parser_id,
      parser_version: m.parser_version,
      measurement_origin: m.measurement_origin as EngineMeasurement['measurement_origin'],
      business_context_origin: m.business_context_origin,
      missing_flag: m.missing_flag,
      duplicate_flag: m.duplicate_flag,
      conflict_flag: m.conflict_flag,
      data_quality_code: m.data_quality_code ?? undefined,
      profile_id: m.profile_id ?? undefined,
      lower_threshold: m.lower_threshold ?? undefined,
      upper_threshold: m.upper_threshold ?? undefined,
      excursion_flag: m.excursion_flag ?? undefined,
      exception_id: m.exception_id ?? undefined,
      review_status: m.review_status ?? undefined,
    }));

    // 1. Detect sensor conflicts (FR-DQ-003, S04)
    const { issues: conflictIssues, conflictRecordIds } = detectSensorConflicts(measurements);

    for (const issue of conflictIssues) {
      // Find or create quality issue
      const existing = await this.prisma.qualityIssue.findFirst({
        where: {
          code: 'SENSOR_CONFLICT',
          record_ids: { hasEvery: issue.record_ids },
        },
      });

      if (!existing) {
        await this.prisma.qualityIssue.create({
          data: {
            record_ids: issue.record_ids,
            code: 'SENSOR_CONFLICT',
            detail: issue.detail,
          },
        });
      }
    }

    if (conflictRecordIds.size > 0) {
      await this.prisma.measurement.updateMany({
        where: { record_id: { in: Array.from(conflictRecordIds) } },
        data: { conflict_flag: true },
      });
    }

    // 2. Detect temperature excursions (FR-EXC-002, FR-EXC-001)
    const { intervals } = detectExcursions(measurements, profile);

    for (const interval of intervals) {
      // Check if exception already exists for this batch and record_ids
      const existing = await this.prisma.exception.findFirst({
        where: {
          batch_id: batchId,
          record_ids: { hasEvery: interval.record_ids },
        },
      });

      let exceptionId = existing?.id;
      if (!existing) {
        const created = await this.prisma.exception.create({
          data: {
            batch_id: batchId,
            record_ids: interval.record_ids,
            profile_id: profile.id,
            status: 'PENDING_REVIEW', // Guardrail 4: No pharma disposition
          },
        });
        exceptionId = created.id;
      }

      // Link exception_id and flag to measurements
      if (exceptionId) {
        await this.prisma.measurement.updateMany({
          where: { record_id: { in: interval.record_ids } },
          data: {
            excursion_flag: true,
            exception_id: exceptionId,
            review_status: 'PENDING',
          },
        });
      }
    }

    // Audit log
    await this.prisma.auditEvent.create({
      data: {
        action: 'EXCEPTION_SCAN',
        entity_type: 'batches',
        entity_id: batchId,
        payload: {
          total_scanned: measurements.length,
          excursions_detected: intervals.length,
          conflicts_detected: conflictIssues.length,
        },
      },
    });

    return {
      batch_id: batchId,
      total_scanned: measurements.length,
      excursions_detected: intervals.length,
      conflicts_detected: conflictIssues.length,
      status: 'COMPLETE',
    };
  }
}