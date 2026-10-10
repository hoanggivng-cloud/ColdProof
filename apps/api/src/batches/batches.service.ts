import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessContextOrigin } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateBatchDto, TimelineEventDto } from './batches.dto';
// import { TimelineEventDto } from './batches.dto';
// import { CreateBatchDto } from './create-batch.dto';
import * as crypto from 'crypto';
import { canonicalJson } from '../common/canonical-json';
import { SimulationDto } from './simulation.dto';
import { generateDemo } from './demo-generator';
import { detectExcursions, detectSensorConflicts } from '../exceptions/exception-engine';
import { Prisma } from '@prisma/client';

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
    if (dto.lower_threshold !== undefined && dto.upper_threshold !== undefined && dto.lower_threshold >= dto.upper_threshold) throw new BadRequestException("Ngưỡng dưới phải nhỏ hơn ngưỡng trên");
    return this.prisma.$transaction(async tx => {
    const nextId = dto.id ?? `CP-BATCH-${String((await tx.batch.count()) + 1).padStart(3, '0')}`;
    await tx.$queryRaw`SELECT id FROM batches WHERE id = ${nextId} FOR UPDATE`;
    if (await tx.measurement.count({ where: { batch_id: nextId } })) throw new ConflictException("Lô đã có số đo; tạo lô mới để thay đổi cấu hình");
    const existing = await tx.batch.findUnique({ where: { id: nextId } });
    const origin = dto.business_context_origin === 'REAL' ? BusinessContextOrigin.REAL : BusinessContextOrigin.SYNTHETIC;
    
    const batch = await tx.batch.upsert({
      where: { id: nextId },
      update: {
        context: { ...((existing?.context ?? {}) as Record<string, unknown>), ...(dto.context ?? {}), device_ids: dto.device_ids ?? [] } as Prisma.InputJsonValue,
        scenario_id: dto.scenario_id,
        profile_id: dto.profile_id ?? 'DEMO_2_8C',
        lower_threshold: dto.lower_threshold ?? 2.0,
        upper_threshold: dto.upper_threshold ?? 8.0,
        business_context_origin: origin,
      },
      create: {
        id: nextId,
        context: { ...((existing?.context ?? {}) as Record<string, unknown>), ...(dto.context ?? {}), device_ids: dto.device_ids ?? [] } as Prisma.InputJsonValue,
        scenario_id: dto.scenario_id,
        profile_id: dto.profile_id ?? 'DEMO_2_8C',
        lower_threshold: dto.lower_threshold ?? 2.0,
        upper_threshold: dto.upper_threshold ?? 8.0,
        business_context_origin: origin,
      },
    });

    if (dto.device_ids && dto.device_ids.length > 0) {
      await tx.segment.deleteMany({ where: { batch_id: batch.id } });
      for (let i = 0; i < dto.device_ids.length; i++) {
        const segId = `LEG-${nextId}-0${i + 1}`;
        await tx.segment.upsert({
          where: { id: segId },
          update: {
            batch_id: batch.id,
            selector: `transit_segment_${i + 1}`,
            business_context_origin: origin,
          },
          create: {
            id: segId,
            batch_id: batch.id,
            selector: `transit_segment_${i + 1}`,
            business_context_origin: origin,
          },
        });
      }
    }

    await tx.auditEvent.create({
      data: {
        action: 'BATCH_UPSERTED',
        entity_type: 'batches',
        entity_id: batch.id,
        payload: { id: batch.id, profile_id: batch.profile_id },
      },
    });

    return batch;
    });
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
      const deviceAlias = segMeasurements[0]?.source_sensor_id ?? 'Chưa có số đo';
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
          detail: `Observed out-of-range samples; configured range ${batch.lower_threshold}–${batch.upper_threshold}°C, maximum ${maxTemp.toFixed(1)}°C`,
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
      context: batch.context,
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

    const ids = (await this.prisma.measurement.findMany({ where: { batch_id: id }, select: { record_id: true } })).map(m => m.record_id);
    const qualityIssues = await this.prisma.qualityIssue.findMany({
      where: { record_ids: { hasSome: ids } }, orderBy: { created_at: 'desc' },
    });

    return {
      exceptions,
      quality_issues: qualityIssues,
    };
  }

  async saveHandover(id: string, handover: Record<string, unknown>, actorId?: string) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM batches WHERE id = ${id} FOR UPDATE`;
      const batch = await tx.batch.findUnique({ where: { id } });
      if (!batch) throw new NotFoundException('Batch not found');
      await tx.batch.update({ where: { id }, data: { context: { ...((batch.context ?? {}) as Record<string, unknown>), handover } as Prisma.InputJsonValue } });
      await tx.auditEvent.create({ data: { actor_id: actorId, action: 'HANDOVER_RECORDED', entity_type: 'batches', entity_id: id, payload: handover as Prisma.InputJsonValue } });
      return { batch_id: id, handover };
    });
  }
  async simulate(id: string, dto: SimulationDto, actorId?: string) {
    const batch = await this.prisma.batch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException('Không tìm thấy lô');
    const context = (batch.context ?? {}) as Record<string, unknown>;
    const devices = Array.isArray(context.device_ids) ? context.device_ids.filter((d): d is string => typeof d === 'string') : [];
    const seed = dto.seed ?? 42;
    const lower = batch.lower_threshold ?? 2, upper = batch.upper_threshold ?? 8;
    let generated: ReturnType<typeof generateDemo>;
    try { generated = generateDemo({ batchId: id, devices, start: String(context.start ?? ''), end: String(context.end ?? ''), lower, upper, seed, scenario: dto.scenario }); }
    catch { throw new BadRequestException('Cần lưu thời gian chuyến hàng và thiết bị hợp lệ trước khi mô phỏng'); }
    const input = generated.records.map(r => ({ ...r, timestamp: r.timestamp.toISOString(), batch_id: id, segment_id: `LEG-${id}-0${generated.devices.indexOf(r.source_sensor_id) + 1}`, source_file: 'simulation.json', parser_id: generated.generator, parser_version: '1.0.0', source_dataset: 'ColdProof Simulation', source_format: 'SIMULATED_LOGGER_V1', source_checksum_sha256: '0'.repeat(64), measurement_origin: 'SYNTHETIC' as const, business_context_origin: 'SYNTHETIC', missing_flag: false, duplicate_flag: false, conflict_flag: false }));
    const intervals = generated.devices.flatMap(device => detectExcursions(input.filter(r => r.source_sensor_id === device), { id: batch.profile_id ?? 'DEMO_2_8C', lower_threshold: lower, upper_threshold: upper }).intervals);
    const excursion = { intervals };
    const conflicts = detectSensorConflicts(input);
    const checksum = crypto.createHash('sha256').update(JSON.stringify(generated)).digest('hex');
    return this.prisma.$transaction(async tx => {
      // Serialize repeated clicks for the same batch without deleting or overwriting evidence.
      await tx.$queryRaw`SELECT id FROM batches WHERE id = ${id} FOR UPDATE`;
      const lockedBatch = await tx.batch.findUniqueOrThrow({ where: { id } });
      if (canonicalJson(lockedBatch.context) !== canonicalJson(batch.context) || lockedBatch.lower_threshold !== batch.lower_threshold || lockedBatch.upper_threshold !== batch.upper_threshold || lockedBatch.profile_id !== batch.profile_id || lockedBatch.business_context_origin !== batch.business_context_origin) throw new ConflictException('Cấu hình vừa thay đổi; tải lại rồi sinh dữ liệu');
      if (await tx.measurement.count({ where: { batch_id: id } })) throw new ConflictException('Lô đã có dữ liệu. Tạo lô mới để chạy kịch bản khác.');
      const source = await tx.sourceAsset.create({ data: { dataset: 'ColdProof Simulation', file_name: `${id}.json`, checksum_sha256: checksum, version: generated.generator, origin: 'SYNTHETIC', uri: `simulation://${id}` } });
      const job = await tx.importJob.create({ data: { source_id: source.id, parser_id: generated.generator, parser_version: '1.0.0', status: 'COMPLETE', parsed_count: generated.records.length, completed_at: new Date() } });
      for (const [index, device] of generated.devices.entries()) await tx.segment.upsert({ where: { id: `LEG-${id}-0${index + 1}` }, update: { source_id: source.id, selector: device }, create: { id: `LEG-${id}-0${index + 1}`, batch_id: id, source_id: source.id, selector: device, business_context_origin: 'SYNTHETIC' } });
      const recordExceptions = new Map<string, string>();
      for (const interval of excursion.intervals) {
        const exception = await tx.exception.create({ data: { batch_id: id, profile_id: interval.profile_id, record_ids: interval.record_ids, status: 'PENDING_REVIEW' } });
        interval.record_ids.forEach(record => recordExceptions.set(record, exception.id));
      }
      await tx.measurement.createMany({ data: generated.records.map(r => ({ ...r, batch_id: id, segment_id: `LEG-${id}-0${generated.devices.indexOf(r.source_sensor_id) + 1}`, source_dataset: 'ColdProof Simulation', source_file: `${id}.json`, source_format: 'SIMULATED_LOGGER_V1', source_checksum_sha256: checksum, parser_id: generated.generator, parser_version: '1.0.0', measurement_origin: 'SYNTHETIC', business_context_origin: 'SYNTHETIC', excursion_flag: recordExceptions.has(r.record_id), exception_id: recordExceptions.get(r.record_id), conflict_flag: conflicts.conflictRecordIds.has(r.record_id) })) });
      for (const issue of conflicts.issues) await tx.qualityIssue.create({ data: { record_ids: issue.record_ids, code: issue.code, detail: issue.detail } });
      if (dto.scenario === 'MISSING') await tx.qualityIssue.create({ data: { record_ids: generated.records.map(r => r.record_id), code: 'MISSING_INTERVAL', detail: 'Simulation intentionally omits samples from 40–50% of the trip; no interpolation.' } });
      const simulation = { scenario: dto.scenario, seed, generator: generated.generator, cadence_ms: generated.cadenceMs, devices: generated.devices, source_id: source.id, import_id: job.id, checksum_sha256: checksum };
      await tx.batch.update({ where: { id }, data: { context: { ...context, simulation } as Prisma.InputJsonValue } });
      await tx.auditEvent.create({ data: { actor_id: actorId, action: 'SIMULATION_GENERATED', entity_type: 'batches', entity_id: id, payload: simulation } });
      return { batch_id: id, status: 'COMPLETE', records: generated.records.length, exceptions: excursion.intervals.length, simulation };
    });
  }

  async generateReport(id: string, generatedBy: string = 'system@coldproof.local') {
    const batch = await this.findOne(id);
    const measurements = await this.findMeasurements(id);
    const { exceptions, quality_issues } = await this.findExceptions(id);

    if (!measurements.length) throw new BadRequestException("Lô chưa có dữ liệu");
    const reviews = await this.prisma.review.findMany({ where: { exception_id: { in: exceptions.map(e => e.id) } }, orderBy: { created_at: "asc" } });
    return this.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM batches WHERE id = ${id} FOR UPDATE`;
    const count = await tx.report.count({ where: { batch_id: id } });
    const version = count + 1;

    const temperatures = measurements.map((m) => m.temperature_c).filter((t): t is number => t !== null && t !== undefined);
    const minTemp = temperatures.length ? Math.min(...temperatures) : null;
    const maxTemp = temperatures.length ? Math.max(...temperatures) : null;

    const assets = await tx.sourceAsset.findMany({ where: { checksum_sha256: { in: [...new Set(measurements.map(m => m.source_checksum_sha256))] } } });
    const provenance = {
      scenario_id: batch.scenario_id,
      product_profile: batch.profile_id,
      source_assets: assets.map(a => a.id),
      parser_versions: [...new Set(measurements.map(m => `${m.parser_id}@${m.parser_version}`))],
      report_id: `RPT-${id}-v${version}`,
      report_version: version,
      generated_at: new Date().toISOString(),
      generated_by: generatedBy,
      batch: {
        batch_id: batch.id,
        scenario_id: batch.scenario_id,
        product_profile_id: batch.profile_id,
        context_origin: batch.business_context_origin,
      },
      shipment_context: batch.context,
      thresholds: { lower: batch.lower_threshold, upper: batch.upper_threshold },
      measurements, exceptions, quality_issues, reviews,
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

    const hashInput = canonicalJson(provenance);
    const checksum = crypto.createHash('sha256').update(hashInput).digest('hex');

    const report = await tx.report.create({
      data: {
        batch_id: id,
        version,
        uri: `/api/reports/batch/${id}/v${version}`,
        checksum_sha256: checksum,
        provenance,
      },
    });

    await tx.auditEvent.create({
      data: {
        action: 'REPORT_GENERATED',
        entity_type: 'reports',
        entity_id: report.id,
        payload: { batch_id: id, version, checksum },
      },
    });

    return report;
    });
  }
}

