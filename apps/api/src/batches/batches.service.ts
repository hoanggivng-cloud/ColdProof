import { Injectable, NotFoundException } from '@nestjs/common';
import { BusinessContextOrigin } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateBatchDto, TimelineEventDto } from './batches.dto';
// import { TimelineEventDto } from './batches.dto';
// import { CreateBatchDto } from './create-batch.dto';
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

  async create(dto: CreateBatchDto) {
    const nextId = dto.id ?? `CP-BATCH-${String((await this.prisma.batch.count()) + 1).padStart(3, '0')}`;
    const origin = dto.business_context_origin === 'REAL' ? BusinessContextOrigin.REAL : BusinessContextOrigin.SYNTHETIC;
    const existing = await this.prisma.batch.findUnique({ where: { id: nextId } });
    if (existing) {
      const updated = await this.prisma.batch.update({
        where: { id: nextId },
        data: {
          profile_id: dto.profile_id ?? existing.profile_id,
          lower_threshold: dto.lower_threshold ?? existing.lower_threshold,
          upper_threshold: dto.upper_threshold ?? existing.upper_threshold,
        },
      });

      if (dto.device_ids && dto.device_ids.length > 0) {
        for (let i = 0; i < dto.device_ids.length; i++) {
          const segId = `LEG-${nextId}-0${i + 1}`;
          const segExist = await this.prisma.segment.findUnique({ where: { id: segId } });
          if (!segExist) {
            await this.prisma.segment.create({
              data: {
                id: segId,
                batch_id: updated.id,
                selector: `transit_segment_${i + 1}`,
                business_context_origin: origin,
              },
            });
          }
        }
      }

      await this.prisma.auditEvent.create({
        data: {
          action: 'BATCH_UPDATED',
          entity_type: 'batches',
          entity_id: updated.id,
          payload: { id: updated.id, profile_id: updated.profile_id },
        },
      });

      return updated;
    }

    const batch = await this.prisma.batch.create({
      data: {
        id: nextId,
        scenario_id: dto.scenario_id,
        profile_id: dto.profile_id ?? 'DEMO_2_8C',
        lower_threshold: dto.lower_threshold ?? 2.0,
        upper_threshold: dto.upper_threshold ?? 8.0,
        business_context_origin: origin,
      },
    });

    if (dto.device_ids && dto.device_ids.length > 0) {
      for (let i = 0; i < dto.device_ids.length; i++) {
        await this.prisma.segment.create({
          data: {
            id: `LEG-${nextId}-0${i + 1}`,
            batch_id: batch.id,
            selector: `transit_segment_${i + 1}`,
            business_context_origin: origin,
          },
        });
      }
    }

    await this.prisma.auditEvent.create({
      data: {
        action: 'BATCH_CREATED',
        entity_type: 'batches',
        entity_id: batch.id,
        payload: { id: batch.id, profile_id: batch.profile_id },
      },
    });

    return batch;
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

    const measurements = await this.prisma.measurement.findMany({
      where: { batch_id: id },
      orderBy: { timestamp: 'asc' },
    });

    const exceptions = await this.prisma.exception.findMany({
      where: { batch_id: id },
      orderBy: { created_at: 'asc' },
    });

    // Build timeline events
    const timeline: TimelineEventDto[] = [];
    const operationalEvents: TimelineEventDto[] = [];

    // Map device aliases per segment
    const segmentDtoList = segments.map((s) => {
      const segMeasurements = measurements.filter((m) => m.segment_id === s.id);
      const deviceAlias = segMeasurements[0]?.source_sensor_id ?? 'SENSOR06';
      return {
        id: s.id,
        batch_id: s.batch_id,
        source_id: s.source_id ?? undefined,
        selector: s.selector,
        handover_id: s.handover_id,
        device_alias: deviceAlias,
        business_context_origin: s.business_context_origin,
      };
    });

    // 1. Segment start and handover events
    for (const seg of segmentDtoList) {
      const segMeasurements = measurements.filter((m) => m.segment_id === seg.id);
      const startTime = segMeasurements[0]?.timestamp?.toISOString() ?? batch.created_at.toISOString();

      timeline.push({
        id: `TL-START-${seg.id}`,
        timestamp: startTime,
        event_type: 'SEGMENT_START',
        segment_id: seg.id,
        device_alias: seg.device_alias,
        detail: `Commenced segment ${seg.id} monitoring via ${seg.device_alias} (${seg.selector})`,
        business_context_origin: 'SYNTHETIC',
      });

      if (seg.handover_id) {
        timeline.push({
          id: `TL-HO-${seg.id}`,
          timestamp: startTime,
          event_type: 'HANDOVER',
          handover_id: seg.handover_id,
          segment_id: seg.id,
          device_alias: seg.device_alias,
          detail: `Handover boundary reached: ${seg.handover_id} transfer point`,
          business_context_origin: 'SYNTHETIC',
        });
      }

      // Operational events (e.g. door opened during cargo transfer at LEG-02)
      if (seg.selector.includes('door_open') || seg.id === 'LEG-02') {
        const doorEvent: TimelineEventDto = {
          id: `TL-OP-DOOR-${seg.id}`,
          timestamp: startTime,
          event_type: 'DOOR_OPEN',
          segment_id: seg.id,
          device_alias: seg.device_alias,
          detail: 'Vehicle cargo door opened for manual handover inspection and transfer',
          business_context_origin: 'SYNTHETIC',
        };
        timeline.push(doorEvent);
        operationalEvents.push(doorEvent);
      }
    }

    // 2. Excursion start/end events from exceptions
    for (const exc of exceptions) {
      const breachMeasurements = measurements.filter((m) => exc.record_ids.includes(m.record_id));
      if (breachMeasurements.length > 0) {
        const excStart = breachMeasurements[0].timestamp?.toISOString() ?? batch.created_at.toISOString();
        const excEnd = breachMeasurements[breachMeasurements.length - 1].timestamp?.toISOString() ?? excStart;
        const maxTemp = Math.max(...breachMeasurements.map((m) => m.temperature_c ?? 0));

        timeline.push({
          id: `TL-EXC-START-${exc.id.slice(0, 8)}`,
          timestamp: excStart,
          event_type: 'EXCURSION_START',
          segment_id: breachMeasurements[0].segment_id ?? undefined,
          device_alias: breachMeasurements[0].source_sensor_id ?? undefined,
          detail: `Temperature breached upper threshold (8.0°C), rising to peak ${maxTemp.toFixed(1)}°C`,
          business_context_origin: 'SYNTHETIC',
        });

        timeline.push({
          id: `TL-EXC-END-${exc.id.slice(0, 8)}`,
          timestamp: excEnd,
          event_type: 'EXCURSION_END',
          segment_id: breachMeasurements[breachMeasurements.length - 1].segment_id ?? undefined,
          device_alias: breachMeasurements[breachMeasurements.length - 1].source_sensor_id ?? undefined,
          detail: 'Temperature excursion window concluded; recovery underway',
          business_context_origin: 'SYNTHETIC',
        });
      }
    }

    // Sort timeline chronologically
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      id: batch.id,
      scenario_id: batch.scenario_id ?? undefined,
      business_context_origin: batch.business_context_origin,
      profile_id: batch.profile_id ?? undefined,
      lower_threshold: batch.lower_threshold ?? undefined,
      upper_threshold: batch.upper_threshold ?? undefined,
      segments: segmentDtoList,
      timeline,
      operational_events: operationalEvents,
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

