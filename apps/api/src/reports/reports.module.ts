import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PdfReportService } from './pdf-report.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, PdfReportService],
  exports: [ReportsService, PdfReportService],
})
export class ReportsModule {}
