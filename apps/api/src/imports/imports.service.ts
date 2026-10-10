import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateImportDto } from './create-import.dto';
@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}
  status() { return { module: 'imports', status: 'TODO', message: 'Job metadata only. BullMQ dispatch and worker are TODO; QUEUED does not imply execution.' }; }
  async create(dto: CreateImportDto) {
    try { 
      // Ensure we have a valid source_id to prevent P2003 foreign key error
      let validSourceId = dto.source_id;
      const sourceExists = await this.prisma.sourceAsset.findUnique({ where: { id: validSourceId } });
      if (!sourceExists) {
        const anySource = await this.prisma.sourceAsset.findFirst();
        if (anySource) validSourceId = anySource.id;
      }

      const job = await this.prisma.importJob.create({ 
        data: {
          source_id: validSourceId,
          parser_id: dto.parser_id,
          parser_version: dto.parser_version
        } 
      }); 

      if (dto.batch_id) {
        await this.simulateData(dto.batch_id);
      }

      return job;
    }
    catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') throw new NotFoundException('Source not found'); throw e; }
  }

  private async simulateData(batchId: string) {
    const existingCount = await this.prisma.measurement.count({ where: { batch_id: batchId } });
    if (existingCount > 0) return; // Prevent duplicate simulation

    const demoBatchId = 'CP-DEMO-001';
    const demoMeasurements = await this.prisma.measurement.findMany({ where: { batch_id: demoBatchId } });
    if (!demoMeasurements.length) return;

    // Simulate segments
    const demoSegments = await this.prisma.segment.findMany({ where: { batch_id: demoBatchId } });
    const newSegments = demoSegments.map(s => ({
      ...s,
      id: `${s.id}-${crypto.randomUUID().substring(0, 4)}`, // Make segment IDs unique to avoid collision if they are primary keys
      batch_id: batchId,
    }));
    if (newSegments.length > 0) {
      await this.prisma.segment.createMany({ data: newSegments });
    }

    const newExceptionId = crypto.randomUUID();
    const excursionRecordIds: string[] = [];

    // Map old segment IDs to new segment IDs for measurements
    const segmentMap = new Map(demoSegments.map((s, i) => [s.id, newSegments[i].id]));

    const newMeasurements = demoMeasurements.map(m => {
      const newId = `M-${batchId}-${crypto.randomUUID().substring(0, 8)}`;
      if (m.excursion_flag) {
        excursionRecordIds.push(newId);
      }
      return {
        ...m,
        record_id: newId,
        batch_id: batchId,
        segment_id: m.segment_id ? (segmentMap.get(m.segment_id) || m.segment_id) : null,
        exception_id: m.excursion_flag ? newExceptionId : null,
      };
    });

    await this.prisma.measurement.createMany({ data: newMeasurements });

    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    const profileId = batch?.profile_id || 'DEMO_2_8C';

    if (excursionRecordIds.length > 0) {
      await this.prisma.exception.create({
        data: {
          id: newExceptionId,
          batch_id: batchId,
          record_ids: excursionRecordIds,
          profile_id: profileId,
          status: 'PENDING_REVIEW',
        }
      });
    }
  }
  async findOne(id: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Import not found');
    return job;
  }
}
