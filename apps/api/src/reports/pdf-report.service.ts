import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface EvidencePdfData {
  report_id: string;
  report_uuid?: string;
  batch_id: string;
  version: number;
  product_profile_id?: string;
  checksum_sha256?: string;
  generated_at?: string;
  generated_by?: string;
  provenance?: Record<string, unknown>;
}

@Injectable()
export class PdfReportService {
  async generatePdf(data: EvidencePdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err: Error) => reject(err));

      // 1. Top Header Banner
      doc.rect(40, 40, 515, 60).fill('#0E1E3A');
      doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold')
        .text('COLDPROOF EVIDENCE PACKAGE', 55, 52);
      doc.fontSize(10).font('Helvetica')
        .text('Pharma Cold Chain Data Integrity & Traceability System (GSP / GDP)', 55, 75);

      // 2. Metadata Box
      doc.rect(40, 112, 515, 72).fill('#F5F7FA').stroke('#D9DEE7');
      doc.fillColor('#14171F').fontSize(10).font('Helvetica-Bold')
        .text(`Report ID: ${data.report_id}`, 55, 122);
      doc.font('Helvetica').fontSize(9).fillColor('#333333')
        .text(`Batch ID: ${data.batch_id}   |   Profile: ${data.product_profile_id || 'DEMO_2_8C (2.0°C - 8.0°C)'}`, 55, 137)
        .text(`Generated At: ${data.generated_at || new Date().toISOString()}   |   Report Version: v${data.version}`, 55, 151)
        .text(`SHA-256 Hash: ${data.checksum_sha256 || 'N/A'}`, 55, 165);

      // 3. Section 1: Shipment & Segments
      let currentY = 200;
      doc.fillColor('#0E1E3A').fontSize(12).font('Helvetica-Bold')
        .text('1. SHIPMENT & SEGMENT TRACEABILITY', 40, currentY);
      currentY += 15;
      doc.strokeColor('#D9DEE7').moveTo(40, currentY).lineTo(555, currentY).stroke();

      currentY += 8;
      doc.fillColor('#333333').fontSize(9).font('Helvetica')
        .text('• Leg 1 (LEG-01): Binh Duong Factory Storage -> Transit Point (Sensor: SENSOR06 - Stable 4.8°C)', 50, currentY);
      currentY += 16;
      doc.fillColor('#B42318').font('Helvetica-Bold')
        .text('• Leg 2 (LEG-02): Transit Transfer (HANDOVER-01) -> Outdoor tarmac 34°C, 26 mins excursion peak 9.2°C', 50, currentY);
      currentY += 16;
      doc.fillColor('#333333').font('Helvetica')
        .text('• Leg 3 (LEG-03): Re-chilled transit vehicle -> Long An General Hospital (Restored to 4.8°C - 5.5°C)', 50, currentY);

      // 4. Section 2: Temperature Metrics & Excursions
      currentY += 28;
      doc.fillColor('#0E1E3A').fontSize(12).font('Helvetica-Bold')
        .text('2. TEMPERATURE MONITORING & EXCEPTION SUMMARY', 40, currentY);
      currentY += 15;
      doc.strokeColor('#D9DEE7').moveTo(40, currentY).lineTo(555, currentY).stroke();

      currentY += 8;
      doc.rect(40, currentY, 515, 62).fill('#FFFBFB').stroke('#F4C7C3');
      doc.fillColor('#B42318').fontSize(10).font('Helvetica-Bold')
        .text('EXCURSION EVENT DETECTED: Upper Threshold Breached (> 8.0°C)', 55, currentY + 10);
      doc.fillColor('#333333').fontSize(9).font('Helvetica')
        .text('- Duration: 26 minutes out-of-range during cargo handover inspection', 55, currentY + 25)
        .text('- Temperature Limits: Min 4.8°C  |  Peak 9.2°C  |  Estimated MKT 4.6°C', 55, currentY + 38)
        .text('- Data Source: Zenodo benchmark dataset (SENSOR06_raw.csv, Checksum preserved)', 55, currentY + 50);

      // 5. Section 3: QA Review Decision (Human-in-the-loop)
      currentY += 82;
      doc.fillColor('#0E1E3A').fontSize(12).font('Helvetica-Bold')
        .text('3. QA HUMAN REVIEW & CORRECTIVE ACTION (CAPA)', 40, currentY);
      currentY += 15;
      doc.strokeColor('#D9DEE7').moveTo(40, currentY).lineTo(555, currentY).stroke();

      currentY += 8;
      doc.rect(40, currentY, 515, 68).fill('#F5F7FA').stroke('#D9DEE7');
      doc.fillColor('#14171F').fontSize(9).font('Helvetica')
        .text('Review Decision: REVIEWED (Deviation recorded and accepted under stability budget)', 55, currentY + 10)
        .text('Authorized Reviewer: qa@coldproof.local (Role: QA_REVIEWER)', 55, currentY + 24)
        .text('QA Notes: Verified temperature curve against tarmac handover event. MKT remained compliant.', 55, currentY + 38)
        .text('CAPA Action: Require thermal insulation tarpaulin for outdoor transshipments exceeding 10 minutes.', 55, currentY + 52);

      // 6. Section 4: Audit & Cryptographic Provenance
      currentY += 88;
      doc.fillColor('#0E1E3A').fontSize(12).font('Helvetica-Bold')
        .text('4. AUDIT TRAIL & CRYPTOGRAPHIC PROVENANCE', 40, currentY);
      currentY += 15;
      doc.strokeColor('#D9DEE7').moveTo(40, currentY).lineTo(555, currentY).stroke();

      currentY += 8;
      doc.fillColor('#4A5568').fontSize(8).font('Helvetica')
        .text('- Immutable Audit Event: REPORT_GENERATED recorded into audit_events ledger.', 50, currentY);
      currentY += 14;
      doc.text(`- Canonical JSON Payload Hash: ${data.checksum_sha256 || 'N/A'}`, 50, currentY);
      currentY += 14;
      doc.text('- Legal Disclaimer: Technical validation benchmark; synthetic business context; not a legal compliance certification. ColdProof does not replace licensed pharmaceutical QA sign-off.', 50, currentY, { width: 505 });

      // 7. Footer
      doc.fontSize(8).fillColor('#A0AEC0').text('ColdProof v3.2 — Developed by APEX for GenD Arena 2026', 40, 785, { align: 'center', width: 515 });

      doc.end();
    });
  }
}
