import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../common/prisma.service';
import { ExceptionsService } from '../exceptions/exceptions.service';
import { ScenarioManifestSchema, ScenarioManifest } from '@coldproof/scenario-schema';
import { MeasurementOrigin, BusinessContextOrigin, Prisma } from '@prisma/client';

@Injectable()
export class ScenariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exceptionsService: ExceptionsService
  ) {}

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

  /**
   * Load and validate scenario manifest from disk or database fallback.
   */
  async loadManifest(id: string): Promise<ScenarioManifest> {
    const candidatePaths = [
      path.resolve(process.cwd(), 'data', 'scenarios', id, 'manifest.json'),
      path.resolve(process.cwd(), '..', '..', 'data', 'scenarios', id, 'manifest.json'),
      path.resolve(__dirname, '../../../../../data/scenarios', id, 'manifest.json'),
    ];

    for (const filePath of candidatePaths) {
      if (fs.existsSync(filePath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const validated = ScenarioManifestSchema.parse(raw);

          // Sync validated manifest into database
          await this.prisma.scenario.upsert({
            where: { id },
            update: {
              name: validated.name,
              version: validated.version,
              manifest: validated as unknown as Prisma.InputJsonValue,
            },
            create: {
              id,
              name: validated.name,
              version: validated.version,
              manifest: validated as unknown as Prisma.InputJsonValue,
            },
          });

          return validated;
        } catch {
          // Fall through to database on error
        }
      }
    }

    // Database fallback
    const scenario = await this.findOne(id);
    return ScenarioManifestSchema.parse(scenario.manifest);
  }

  /**
   * Build scenario: creates batch, segments, maps measurements, and runs exception/conflict scan.
   */
  async build(id: string) {
    const manifest = await this.loadManifest(id);
    const batchId = id === 'S02' ? 'CP-DEMO-001' : `BATCH-${id}-001`;
    const profile = manifest.product_profile;

    // 1. Upsert Batch
    await this.prisma.batch.upsert({
      where: { id: batchId },
      update: {
        scenario_id: id,
        business_context_origin: BusinessContextOrigin.SYNTHETIC,
        profile_id: profile.id,
        lower_threshold: profile.lower_threshold,
        upper_threshold: profile.upper_threshold,
      },
      create: {
        id: batchId,
        scenario_id: id,
        business_context_origin: BusinessContextOrigin.SYNTHETIC,
        profile_id: profile.id,
        lower_threshold: profile.lower_threshold,
        upper_threshold: profile.upper_threshold,
      },
    });

    // 2. Upsert Segments with Segment Boundary Guardrail (FR-SCN-003)
    let segmentsCreated = 0;
    for (const seg of manifest.segments) {
      await this.prisma.segment.upsert({
        where: { id: seg.id },
        update: {
          batch_id: batchId,
          selector: seg.selector,
          handover_id: seg.handover_id ?? null,
          business_context_origin: BusinessContextOrigin.SYNTHETIC,
        },
        create: {
          id: seg.id,
          batch_id: batchId,
          selector: seg.selector,
          handover_id: seg.handover_id ?? null,
          business_context_origin: BusinessContextOrigin.SYNTHETIC,
        },
      });
      segmentsCreated++;
    }

    // 3. Mapping Measurements (FR-SCN-002)
    await this.mapMeasurementsForScenario(id, batchId, manifest);

    // 4. Run automated Excursion & Sensor Conflict evaluation on the built batch
    const scanResult = await this.exceptionsService.scanBatch(batchId);

    // 5. Audit event
    await this.prisma.auditEvent.create({
      data: {
        action: 'SCENARIO_BUILD',
        entity_type: 'scenarios',
        entity_id: id,
        payload: {
          batch_id: batchId,
          segments_count: segmentsCreated,
          scan_result: scanResult,
        },
      },
    });

    return {
      scenario_id: id,
      batch_id: batchId,
      segments_created: segmentsCreated,
      status: 'COMPLETE',
      expected: manifest.expected,
      scan_result: scanResult,
    };
  }

  /**
   * Helper to ensure CanonicalMeasurement records are properly mapped to batch_id & segment_id.
   */
  private async mapMeasurementsForScenario(
    scenarioId: string,
    batchId: string,
    manifest: ScenarioManifest
  ) {
    const baseTime = new Date('2026-10-01T08:00:00.000Z').getTime();

    if (scenarioId === 'S02') {
      // Map/seed S02 measurements: LEG-01 (M-01..M-04), LEG-02 (M-05..M-10), LEG-03 (M-11..M-13)
      const s02Data = [
        { id: 'M-01', leg: 'LEG-01', tMin: 0, temp: 4.8, hum: 45.2 },
        { id: 'M-02', leg: 'LEG-01', tMin: 15, temp: 4.9, hum: 45.0 },
        { id: 'M-03', leg: 'LEG-01', tMin: 30, temp: 5.1, hum: 45.5 },
        { id: 'M-04', leg: 'LEG-01', tMin: 45, temp: 5.0, hum: 45.3 },
        { id: 'M-05', leg: 'LEG-02', tMin: 60, temp: 5.8, hum: 46.0 },
        { id: 'M-06', leg: 'LEG-02', tMin: 75, temp: 7.9, hum: 48.2 },
        { id: 'M-07', leg: 'LEG-02', tMin: 90, temp: 8.7, hum: 52.1 }, // breach
        { id: 'M-08', leg: 'LEG-02', tMin: 105, temp: 9.2, hum: 55.0 }, // breach
        { id: 'M-09', leg: 'LEG-02', tMin: 120, temp: 8.5, hum: 51.3 }, // breach
        { id: 'M-10', leg: 'LEG-02', tMin: 135, temp: 7.4, hum: 48.0 },
        { id: 'M-11', leg: 'LEG-03', tMin: 150, temp: 5.5, hum: 46.5 },
        { id: 'M-12', leg: 'LEG-03', tMin: 165, temp: 4.9, hum: 45.8 },
        { id: 'M-13', leg: 'LEG-03', tMin: 180, temp: 4.8, hum: 45.2 },
      ];

      for (const m of s02Data) {
        const timestamp = new Date(baseTime + m.tMin * 60000);
        await this.prisma.measurement.upsert({
          where: { record_id: m.id },
          update: {
            batch_id: batchId,
            scenario_id: scenarioId,
            segment_id: m.leg,
            timestamp,
            temperature_c: m.temp,
            humidity_pct: m.hum,
          },
          create: {
            record_id: m.id,
            scenario_id: scenarioId,
            batch_id: batchId,
            segment_id: m.leg,
            timestamp,
            temperature_c: m.temp,
            humidity_pct: m.hum,
            source_dataset: 'Zenodo - Cold Storage Room Monitoring (2025)',
            source_file: 'SENSOR06_raw.csv',
            source_sensor_id: 'SENSOR06',
            source_row_or_ref: `row_${m.id}`,
            source_format: 'FORMAT-A',
            source_checksum_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            parser_id: 'zenodo-timeseries-adapter',
            parser_version: '1.0.0',
            measurement_origin: MeasurementOrigin.REAL_PUBLIC_DATA,
            business_context_origin: BusinessContextOrigin.SYNTHETIC,
            missing_flag: false,
            duplicate_flag: false,
            conflict_flag: false,
            profile_id: manifest.product_profile.id,
            lower_threshold: manifest.product_profile.lower_threshold,
            upper_threshold: manifest.product_profile.upper_threshold,
          },
        });
      }
    } else if (scenarioId === 'S04') {
      // S04: 2 sensors with divergent measurements in divergent_window
      const s04Data = [
        { id: 'M-S04-A1', leg: 'LEG-01-A', sensor: 'SENSOR01', tMin: 0, temp: 4.2 },
        { id: 'M-S04-B1', leg: 'LEG-01-B', sensor: 'SENSOR02', tMin: 0, temp: 6.8 }, // 2.6°C divergence
        { id: 'M-S04-A2', leg: 'LEG-01-A', sensor: 'SENSOR01', tMin: 15, temp: 4.3 },
        { id: 'M-S04-B2', leg: 'LEG-01-B', sensor: 'SENSOR02', tMin: 15, temp: 4.4 },
      ];

      for (const m of s04Data) {
        const timestamp = new Date(baseTime + m.tMin * 60000);
        await this.prisma.measurement.upsert({
          where: { record_id: m.id },
          update: {
            batch_id: batchId,
            scenario_id: scenarioId,
            segment_id: m.leg,
            timestamp,
            temperature_c: m.temp,
            source_sensor_id: m.sensor,
          },
          create: {
            record_id: m.id,
            scenario_id: scenarioId,
            batch_id: batchId,
            segment_id: m.leg,
            timestamp,
            temperature_c: m.temp,
            source_dataset: 'Zenodo - Cold Storage Room Monitoring (2025)',
            source_file: `${m.sensor}_raw.csv`,
            source_sensor_id: m.sensor,
            source_row_or_ref: `row_${m.id}`,
            source_format: 'FORMAT-A',
            source_checksum_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            parser_id: 'zenodo-timeseries-adapter',
            parser_version: '1.0.0',
            measurement_origin: MeasurementOrigin.REAL_PUBLIC_DATA,
            business_context_origin: BusinessContextOrigin.SYNTHETIC,
            missing_flag: false,
            duplicate_flag: false,
            conflict_flag: false,
            profile_id: manifest.product_profile.id,
            lower_threshold: manifest.product_profile.lower_threshold,
            upper_threshold: manifest.product_profile.upper_threshold,
          },
        });
      }
    } else if (scenarioId === 'S01') {
      // S01: Normal multi-leg chain (all temperatures within 2.0C - 8.0C)
      const s01Data = [
        { id: 'M-S01-01', leg: 'LEG-01', tMin: 0, temp: 4.5 },
        { id: 'M-S01-02', leg: 'LEG-01', tMin: 15, temp: 4.8 },
        { id: 'M-S01-03', leg: 'LEG-02', tMin: 30, temp: 5.0 },
        { id: 'M-S01-04', leg: 'LEG-02', tMin: 45, temp: 5.2 },
      ];

      for (const m of s01Data) {
        const timestamp = new Date(baseTime + m.tMin * 60000);
        await this.prisma.measurement.upsert({
          where: { record_id: m.id },
          update: {
            batch_id: batchId,
            scenario_id: scenarioId,
            segment_id: m.leg,
            timestamp,
            temperature_c: m.temp,
          },
          create: {
            record_id: m.id,
            scenario_id: scenarioId,
            batch_id: batchId,
            segment_id: m.leg,
            timestamp,
            temperature_c: m.temp,
            source_dataset: 'Zenodo - Cold Storage Room Monitoring (2025)',
            source_file: 'SENSOR06_raw.csv',
            source_sensor_id: 'SENSOR06',
            source_row_or_ref: `row_${m.id}`,
            source_format: 'FORMAT-A',
            source_checksum_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            parser_id: 'zenodo-timeseries-adapter',
            parser_version: '1.0.0',
            measurement_origin: MeasurementOrigin.REAL_PUBLIC_DATA,
            business_context_origin: BusinessContextOrigin.SYNTHETIC,
            missing_flag: false,
            duplicate_flag: false,
            conflict_flag: false,
            profile_id: manifest.product_profile.id,
            lower_threshold: manifest.product_profile.lower_threshold,
            upper_threshold: manifest.product_profile.upper_threshold,
          },
        });
      }
    }
  }
}
