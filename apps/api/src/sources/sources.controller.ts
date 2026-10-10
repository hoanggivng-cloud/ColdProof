import { UseGuards as Protect } from '@nestjs/common';
import { JwtAuthGuard as AuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard as AccessGuard } from '../auth/guards/roles.guard';
import { Roles as AllowRoles } from '../auth/decorators/roles.decorator';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SourcesService } from './sources.service';
import { CreateSourceDto } from './create-source.dto';
@ApiTags('sources') @Protect(AuthGuard, AccessGuard)
@AllowRoles('ADMIN')
@Controller('sources')
export class SourcesController {
  constructor(private readonly service: SourcesService) {}
  @Get('status') status() { return this.service.status(); }
  @Get() @ApiOperation({ summary: 'List all registered source assets' })
  findAll() { return this.service.findAll(); }
  @Post() @ApiOperation({ summary: 'Register immutable source metadata; content upload/verification TODO' })
  create(@Body() dto: CreateSourceDto) { return this.service.create(dto); }
  @Get(':id') findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }
}
