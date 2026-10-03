import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  status() {
    return {
      module: 'reports',
      status: 'READY',
      message: 'Evidence Package Service active. PDF/JSON report generation with SHA-256 provenance hash enabled.',
    };
  }

  async findAll() {
    return await this.prisma.report.findMany({
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
    });
    if (!report) throw new NotFoundException(`Report ${id} not found`);
    return report;
  }

  async download(id: string) {
    const report = await this.findOne(id);
    return {
      report_id: `RPT-${report.batch_id}-v${report.version}`,
      report_uuid: report.id,
      batch_id: report.batch_id,
      version: report.version,
      checksum_sha256: report.checksum_sha256,
      created_at: report.created_at,
      evidence_package: report.provenance,
    };
  }
}

