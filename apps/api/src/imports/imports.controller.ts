import { Roles as AllowRoles } from '../auth/decorators/roles.decorator';
import { UseGuards as Protect } from '@nestjs/common';
import { JwtAuthGuard as AuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard as AccessGuard } from '../auth/guards/roles.guard';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ImportsService } from './imports.service';
import { CreateImportDto } from './create-import.dto';
@ApiTags('imports') @Protect(AuthGuard, AccessGuard)
@Controller('imports')
export class ImportsController {
  constructor(private readonly service: ImportsService) {}
  @Get('status') status() { return this.service.status(); }
  @AllowRoles('OPERATOR', 'ADMIN')
  @Post() @ApiOperation({ summary: 'Create queued metadata only; worker is TODO' })
  create(@Body() dto: CreateImportDto) { return this.service.create(dto); }
  @Get(':id') findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }
}
