import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class BatchesService {
  constructor(private readonly prisma: PrismaService) {}

  status() {
    return {
      module: 'batches',
      status: 'READY',
      message: 'Batch evidence workflow active. Batch-centric timeline and measurements available.',
    };
  }

  async findAll() {
    const batches = await this.prisma.batch.findMany({
      orderBy: { created_at: 'desc' },
    });

    const results = await Promise.all(
      batches.map(async (b) => {
        const segmentsCount = await this.prisma.segment.count({
          where: { batch_id: b.id },
        });

        const exceptionsCount = await this.prisma.exception.count({
          where: { batch_id: b.id },
        });

        const missingCount = await this.prisma.measurement.count({
          where: { batch_id: b.id, missing_flag: true },
        });

        const conflictCount = await this.prisma.measurement.count({
          where: { batch_id: b.id, conflict_flag: true },
        });

        let status: 'NORMAL' | 'EXCEPTION' | 'MISSING' | 'CONFLICT' = 'NORMAL';
        if (conflictCount > 0) status = 'CONFLICT';
        else if (missingCount > 0) status = 'MISSING';
        else if (exceptionsCount > 0) status = 'EXCEPTION';

        return {
          id: b.id,
          scenario_id: b.scenario_id ?? undefined,
          status,
          segments_count: segmentsCount,
          profile_id: b.profile_id ?? undefined,
          lower_threshold: b.lower_threshold ?? undefined,
          upper_threshold: b.upper_threshold ?? undefined,
          created_at: b.created_at,
        };
      }),
    );

    return results;
  }

  async findOne(id: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
    });
    if (!batch) throw new NotFoundException(`Batch ${id} not found`);

    const segments = await this.prisma.segment.findMany({
      where: { batch_id: id },
      orderBy: { id: 'asc' },
    });

    return {
      id: batch.id,
      scenario_id: batch.scenario_id ?? undefined,
      business_context_origin: batch.business_context_origin,
      profile_id: batch.profile_id ?? undefined,
      lower_threshold: batch.lower_threshold ?? undefined,
      upper_threshold: batch.upper_threshold ?? undefined,
      segments: segments.map((s) => ({
        id: s.id,
        batch_id: s.batch_id,
        source_id: s.source_id ?? undefined,
        selector: s.selector,
        handover_id: s.handover_id,
        business_context_origin: s.business_context_origin,
      })),
      created_at: batch.created_at,
    };
  }

  async findMeasurements(id: string) {
    await this.findOne(id);
    const measurements = await this.prisma.measurement.findMany({
      where: { batch_id: id },
      orderBy: { timestamp: 'asc' },
    });
    return measurements;
  }

  async findExceptions(id: string) {
    await this.findOne(id);
    const exceptions = await this.prisma.exception.findMany({
      where: { batch_id: id },
      orderBy: { created_at: 'desc' },
    });

    const qualityIssues = await this.prisma.qualityIssue.findMany({
      orderBy: { created_at: 'desc' },
    });

    return {
      exceptions,
      quality_issues: qualityIssues,
    };
  }

  async generateReport(id: string) {
    const batch = await this.findOne(id);
    const measurements = await this.findMeasurements(id);
    const { exceptions, quality_issues } = await this.findExceptions(id);

    const count = await this.prisma.report.count({ where: { batch_id: id } });
    const version = count + 1;

    const temperatures = measurements.map((m) => m.temperature_c).filter((t): t is number => t !== null && t !== undefined);
    const minTemp = temperatures.length ? Math.min(...temperatures) : null;
    const maxTemp = temperatures.length ? Math.max(...temperatures) : null;

    const provenance = {
      report_id: `RPT-${id}-v${version}`,
      report_version: version,
      generated_at: new Date().toISOString(),
      generated_by: 'system@coldproof.local',
      batch: {
        batch_id: batch.id,
        scenario_id: batch.scenario_id,
        product_profile_id: batch.profile_id,
        context_origin: batch.business_context_origin,
      },
      segments: batch.segments,
      measurements_summary: {
        record_count: measurements.length,
        min_c: minTemp,
        max_c: maxTemp,
      },
      exceptions_count: exceptions.length,
      quality_issues_count: quality_issues.length,
      disclaimer: 'Technical validation benchmark; synthetic business context; not a legal compliance certification.',
    };

    const hashInput = JSON.stringify(provenance);
    const checksum = crypto.createHash('sha256').update(hashInput).digest('hex');

    const report = await this.prisma.report.create({
      data: {
        batch_id: id,
        version,
        uri: `/api/reports/batch/${id}/v${version}`,
        checksum_sha256: checksum,
        provenance,
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        action: 'REPORT_GENERATED',
        entity_type: 'reports',
        entity_id: report.id,
        payload: { batch_id: id, version, checksum },
      },
    });

    return report;
  }
}

