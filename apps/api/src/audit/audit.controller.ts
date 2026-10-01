import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditStatusDto } from './audit.dto';
@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}
  @Get('status') @ApiOkResponse({ type: AuditStatusDto })
  status() { return this.service.status(); }
}
