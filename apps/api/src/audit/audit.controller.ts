import { UseGuards as Protect } from '@nestjs/common';
import { JwtAuthGuard as AuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard as AccessGuard } from '../auth/guards/roles.guard';
import { Roles as AllowRoles } from '../auth/decorators/roles.decorator';
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditStatusDto, AuditEventDto } from './audit.dto';

@ApiTags('audit')
@Protect(AuthGuard, AccessGuard)
@AllowRoles('ADMIN')
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

