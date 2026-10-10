import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PdfReportService } from './pdf-report.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfReportService,
  ) {}

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

  async getPdf(id: string): Promise<Buffer> {
    const report = await this.findOne(id);
    const provenance = (report.provenance ?? {}) as Record<string, unknown>;
    const batchInfo = (provenance.batch ?? {}) as Record<string, unknown>;

    return this.pdfService.generatePdf({
      report_id: `RPT-${report.batch_id}-v${report.version}`,
      report_uuid: report.id,
      batch_id: report.batch_id,
      version: report.version,
      product_profile_id: (batchInfo.product_profile_id as string) ?? 'DEMO_2_8C',
      checksum_sha256: report.checksum_sha256 ?? undefined,
      generated_at: report.created_at.toISOString(),
      provenance,
    });
  }
}
