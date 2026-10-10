import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, MeasurementOrigin, BusinessContextOrigin, ImportStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { ExceptionsService } from '../exceptions/exceptions.service';
import { CreateImportDto } from './create-import.dto';
import { IngestImportDto } from './ingest-import.dto';

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exceptionsService: ExceptionsService,
  ) {}

  status() {
    return {
      module: 'imports',
      status: 'READY',
      message: 'Import pipeline active. Supports TV1 simulated loggers and file ingestion into database.',
    };
  }

  async create(dto: CreateImportDto) {
    try {
      return await this.prisma.importJob.create({ data: dto });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new NotFoundException('Source not found');
      }
      throw e;
    }
  }

  async findOne(id: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Import not found');
    return job;
  }

  /**
   * Ingest telemetry measurements directly into PostgreSQL for a specified batch.
   * Runs automated excursion scanning and quality evaluation.
   */
  async ingest(dto: IngestImportDto) {
    const batchId = dto.batch_id.trim();
    if (!batchId) throw new NotFoundException('Mã lô (batch_id) không được để trống.');

    // 1. Ensure Batch exists
    let batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) {
      batch = await this.prisma.batch.create({
        data: {
          id: batchId,
          scenario_id: 'S02',
          business_context_origin: BusinessContextOrigin.SYNTHETIC,
          profile_id: 'DEMO_2_8C',
          lower_threshold: 2.0,
          upper_threshold: 8.0,
        },
      });
    }

    const lower = batch.lower_threshold ?? 2.0;
    const upper = batch.upper_threshold ?? 8.0;

    // 2. Ensure Segment exists
    let segments = await this.prisma.segment.findMany({ where: { batch_id: batchId } });
    const primaryDevice = dto.device_id || 'DEV-DEMO-01';

    if (segments.length === 0) {
      const seg = await this.prisma.segment.create({
        data: {
          id: `SEG-${batchId}-01`,
          batch_id: batchId,
          selector: `monitoring_window_${primaryDevice}`,
          handover_id: null,
          business_context_origin: BusinessContextOrigin.SYNTHETIC,
        },
      });
      segments = [seg];
    }

    // 3. Prepare measurement rows
    interface PreparedRow {
      timestamp: Date;
      temp_c: number;
      hum_pct: number;
      sensor_id: string;
      source_ref: string;
    }

    const preparedRows: PreparedRow[] = [];
    const baseTime = new Date();
    baseTime.setMinutes(baseTime.getMinutes() - 120); // 2 hours ago

    if (dto.records && dto.records.length > 0) {
      // Use records sent from client preview
      dto.records.forEach((r, idx) => {
        const time = r.timestamp ? new Date(r.timestamp) : new Date(baseTime.getTime() + idx * 5 * 60000);
        preparedRows.push({
          timestamp: time,
          temp_c: typeof r.temp_c === 'number' ? r.temp_c : 5.0,
          hum_pct: typeof r.humidity === 'number' ? r.humidity : 65.0,
          sensor_id: r.device_id || primaryDevice,
          source_ref: r.source_ref || `row_${idx + 1}`,
        });
      });
    } else {
      // Generate standard TV1 dataset based on format
      const format = dto.format || 'LOGGER_A';
      if (format.includes('CP_DEMO') || format.includes('EXCURSION')) {
        // Multi-segment journey with excursion (S02 pattern from TV1)
        const s02Temps = [4.8, 4.9, 5.1, 5.0, 5.8, 7.9, 8.7, 9.2, 8.5, 7.4, 5.5, 4.9, 4.8];
        s02Temps.forEach((temp, idx) => {
          preparedRows.push({
            timestamp: new Date(baseTime.getTime() + idx * 15 * 60000),
            temp_c: temp,
            hum_pct: 45.0 + (idx % 5),
            sensor_id: primaryDevice,
            source_ref: `M-${idx + 1}`,
          });
        });
      } else if (format.includes('LOGGER_B')) {
        // TV1 Logger B vendor-inspired pattern
        const bTemps = [5.1, 5.2, 5.0, 4.9, 5.3, 5.4, 5.2, 5.0, 5.1, 4.8];
        bTemps.forEach((temp, idx) => {
          preparedRows.push({
            timestamp: new Date(baseTime.getTime() + idx * 10 * 60000),
            temp_c: temp,
            hum_pct: 68.0 + (idx % 4),
            sensor_id: 'B-0001',
            source_ref: `row_${idx + 1}`,
          });
        });
      } else {
        // TV1 Logger A standard stream (stable within 2.0C - 8.0C)
        const aTemps = [4.6, 4.8, 5.0, 5.2, 5.1, 4.9, 5.3, 5.0, 4.7, 4.9, 5.1, 5.0];
        aTemps.forEach((temp, idx) => {
          preparedRows.push({
            timestamp: new Date(baseTime.getTime() + idx * 10 * 60000),
            temp_c: temp,
            hum_pct: 70.0 + (idx % 5),
            sensor_id: 'LOGGER-A-001',
            source_ref: `row_${idx + 1}`,
          });
        });
      }
    }

    // 4. Clean old measurements for this batch to ensure idempotent re-import
    await this.prisma.measurement.deleteMany({
      where: { batch_id: batchId },
    });

    // 5. Insert new measurements into PostgreSQL
    const checksum = crypto.createHash('sha256').update(dto.raw_payload || JSON.stringify(preparedRows)).digest('hex');
    const segmentId = segments[0]?.id ?? `SEG-${batchId}-01`;

    for (let i = 0; i < preparedRows.length; i++) {
      const row = preparedRows[i];
      const recordId = `M-${batchId}-${String(i + 1).padStart(3, '0')}`;
      const isExcursion = row.temp_c < lower || row.temp_c > upper;

      await this.prisma.measurement.create({
        data: {
          record_id: recordId,
          scenario_id: batch.scenario_id ?? 'S02',
          batch_id: batchId,
          segment_id: segmentId,
          timestamp: row.timestamp,
          temperature_c: row.temp_c,
          humidity_pct: row.hum_pct,
          source_dataset: 'TV1 - Runtime Logger Dataset',
          source_file: dto.file_name ?? 'logger_feed.json',
          source_sensor_id: row.sensor_id,
          source_row_or_ref: row.source_ref,
          source_format: dto.format ?? 'LOGGER_A',
          source_checksum_sha256: checksum,
          parser_id: 'runtime-logger',
          parser_version: '1.0.0',
          measurement_origin: MeasurementOrigin.SYNTHETIC,
          business_context_origin: BusinessContextOrigin.SYNTHETIC,
          excursion_flag: isExcursion,
        },
      });
    }

    // 6. Run automated Excursion Scan on the batch
    const scanResult = await this.exceptionsService.scanBatch(batchId);

    // 7. Record Import Job for audit compliance
    const firstSource = await this.prisma.sourceAsset.findFirst();
    if (firstSource) {
      await this.prisma.importJob.create({
        data: {
          source_id: firstSource.id,
          parser_id: 'runtime-logger',
          parser_version: '1.0.0',
          status: ImportStatus.COMPLETE,
          parsed_count: preparedRows.length,
          warning_count: scanResult.excursions_detected,
          completed_at: new Date(),
        },
      });
    }

    // 8. Record Immutable Audit Event
    await this.prisma.auditEvent.create({
      data: {
        action: 'LOGGER_INGESTED',
        entity_type: 'batches',
        entity_id: batchId,
        payload: {
          batch_id: batchId,
          record_count: preparedRows.length,
          device_id: primaryDevice,
          format: dto.format ?? 'LOGGER_A',
          excursions_detected: scanResult.excursions_detected,
        },
      },
    });

    const temps = preparedRows.map((r) => r.temp_c);
    return {
      success: true,
      batch_id: batchId,
      count: preparedRows.length,
      min_temp: temps.length ? Math.min(...temps) : 0,
      max_temp: temps.length ? Math.max(...temps) : 0,
      excursions_count: scanResult.excursions_detected,
      scan_result: scanResult,
      message: `Đã nạp thành công ${preparedRows.length} bản ghi số đo nhiệt độ vào CSDL cho lô ${batchId}.`,
    };
  }
}
