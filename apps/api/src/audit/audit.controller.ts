import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditStatusDto, AuditEventDto } from './audit.dto';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get('status')
  @ApiOkResponse({ type: AuditStatusDto })
  @ApiOperation({ summary: 'Get audit module status' })
  status() {
    return this.service.status();
  }

  @Get()
  @ApiOkResponse({ type: [AuditEventDto] })
  @ApiOperation({ summary: 'List immutable audit trail events' })
  findAll() {
    return this.service.findAll();
  }
}

