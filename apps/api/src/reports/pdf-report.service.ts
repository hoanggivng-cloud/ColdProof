import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { existsSync } from 'fs';
import { join } from 'path';
export interface EvidencePdfData { report_id: string; report_uuid?: string; batch_id: string; version: number; product_profile_id?: string; checksum_sha256?: string; generated_at?: string; provenance?: Record<string, unknown>; }
@Injectable()
export class PdfReportService {
  async generatePdf(data: EvidencePdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk)); doc.on('end', () => resolve(Buffer.concat(buffers))); doc.on('error', reject);
      const font = join(__dirname, '../../assets/DejaVuSans.ttf');
      if (existsSync(font)) doc.font(font);
      doc.fontSize(18).text('COLDPROOF EVIDENCE PACKAGE');
      doc.moveDown().fontSize(10).text('SYNTHETIC / Dữ liệu mô phỏng — Technical demonstration');
      doc.text(`Batch: ${data.batch_id} | Version: ${data.version}`);
      doc.text(`Report: ${data.report_id}`); doc.text(`Generated: ${data.generated_at}`);
      doc.text(`Evidence JSON SHA-256: ${data.checksum_sha256}`);
      const provenance = data.provenance ?? {};
      const section = (title: string, value: unknown) => {
        doc.moveDown().fontSize(12).text(title); doc.fontSize(8);
        const text = JSON.stringify(value ?? null, null, 2);
        for (const line of text.split('\n')) doc.text(line, { width: 510 });
      };
      section('1. Shipment configuration and simulation provenance', { batch: provenance.batch, context: provenance.shipment_context, thresholds: provenance.thresholds });
      section('2. Measurement summary', provenance.measurements_summary);
      section('3. Exceptions and data quality', { exceptions: provenance.exceptions, quality_issues: provenance.quality_issues });
      section('4. Human QA review history', provenance.reviews);
      section('5. Source assets and parser identity', Array.isArray(provenance.measurements) ? [...new Map((provenance.measurements as Record<string, unknown>[]).map(m => [String(m.source_checksum_sha256), { file: m.source_file, checksum: m.source_checksum_sha256, parser: m.parser_id, version: m.parser_version, origin: m.measurement_origin }])).values()] : []);
      doc.moveDown().fontSize(12).text('6. Observed samples (full records in JSON evidence)');
      if (Array.isArray(provenance.measurements)) for (const m of provenance.measurements as Record<string, unknown>[]) doc.fontSize(8).text(`${m.timestamp} | ${m.source_sensor_id} | ${m.temperature_c} C | ${m.source_row_or_ref}`);
      doc.moveDown().fontSize(9).text('Simulation evidence only. No automatic product release or rejection decision. QA actions are recorded exactly as submitted.');
      doc.end();
    });
  }
}
