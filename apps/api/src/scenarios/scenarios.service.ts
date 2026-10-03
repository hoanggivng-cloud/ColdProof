import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ScenariosService {
  constructor(private readonly prisma: PrismaService) {}

  status() {
    return {
      module: 'scenarios',
      status: 'READY',
      message: 'Scenarios module active. S01-S06 manifests available for scenario building.',
    };
  }

  async findAll() {
    return await this.prisma.scenario.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: string) {
    const scenario = await this.prisma.scenario.findUnique({
      where: { id },
    });
    if (!scenario) throw new NotFoundException(`Scenario ${id} not found`);
    return scenario;
  }

  async build(id: string) {
    const scenario = await this.findOne(id);
    const manifest = scenario.manifest as Record<string, any>;
    const batchId = id === 'S02' ? 'CP-DEMO-001' : `BATCH-${id}-001`;

    const profile = manifest?.product_profile ?? { id: 'DEMO_2_8C', lower_threshold: 2.0, upper_threshold: 8.0 };

    // Create or update batch
    await this.prisma.batch.upsert({
      where: { id: batchId },
      update: {
        scenario_id: id,
        business_context_origin: 'SYNTHETIC',
        profile_id: profile.id,
        lower_threshold: profile.lower_threshold,
        upper_threshold: profile.upper_threshold,
      },
      create: {
        id: batchId,
        scenario_id: id,
        business_context_origin: 'SYNTHETIC',
        profile_id: profile.id,
        lower_threshold: profile.lower_threshold,
        upper_threshold: profile.upper_threshold,
      },
    });

    // Create segments if present in manifest
    const segments = Array.isArray(manifest?.segments) ? manifest.segments : [];
    let segmentsCreated = 0;
    for (const seg of segments) {
      await this.prisma.segment.upsert({
        where: { id: seg.id },
        update: {
          batch_id: batchId,
          selector: seg.selector ?? 'window',
          handover_id: seg.handover_id ?? null,
          business_context_origin: 'SYNTHETIC',
        },
        create: {
          id: seg.id,
          batch_id: batchId,
          selector: seg.selector ?? 'window',
          handover_id: seg.handover_id ?? null,
          business_context_origin: 'SYNTHETIC',
        },
      });
      segmentsCreated++;
    }

    // Append audit event
    await this.prisma.auditEvent.create({
      data: {
        action: 'SCENARIO_BUILD',
        entity_type: 'scenarios',
        entity_id: id,
        payload: { batch_id: batchId, segments_count: segmentsCreated },
      },
    });

    return {
      scenario_id: id,
      batch_id: batchId,
      segments_created: segmentsCreated,
      status: 'COMPLETE',
      expected: manifest?.expected,
    };
  }
}

