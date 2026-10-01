import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportsStatusDto } from './reports.dto';
@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}
  @Get('status') @ApiOkResponse({ type: ReportsStatusDto })
  status() { return this.service.status(); }
}
