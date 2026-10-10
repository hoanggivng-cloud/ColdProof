import { Controller, Get, Header, Param, ParseUUIDPipe, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiParam, ApiProduces } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportsStatusDto, ReportSummaryDto } from './reports.dto';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('status')
  @ApiOkResponse({ type: ReportsStatusDto })
  @ApiOperation({ summary: 'Get reports module status' })
  status() {
    return this.service.status();
  }

  @Get()
  @ApiOkResponse({ type: [ReportSummaryDto] })
  @ApiOperation({ summary: 'List all generated evidence reports' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiParam({ name: 'id', example: '77777777-7777-7777-7777-777777777771', description: 'Report UUID' })
  @ApiOperation({ summary: 'Get report metadata and provenance hash' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/download')
  @ApiParam({ name: 'id', example: '77777777-7777-7777-7777-777777777771', description: 'Report UUID' })
  @ApiOperation({ summary: 'Download JSON evidence package' })
  download(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.download(id);
  }

  @Get(':id/pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="coldproof-evidence-report.pdf"')
  @ApiProduces('application/pdf')
  @ApiParam({ name: 'id', example: '77777777-7777-7777-7777-777777777771', description: 'Report UUID' })
  @ApiOperation({ summary: 'Download generated PDF evidence report' })
  async downloadPdf(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const pdfBuffer = await this.service.getPdf(id);
    return new StreamableFile(pdfBuffer);
  }
}
