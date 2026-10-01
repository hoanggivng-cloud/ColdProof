import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ImportsService } from './imports.service';
import { CreateImportDto } from './create-import.dto';
@ApiTags('imports') @Controller('imports')
export class ImportsController {
  constructor(private readonly service: ImportsService) {}
  @Get('status') status() { return this.service.status(); }
  @Post() @ApiOperation({ summary: 'Create queued metadata only; worker is TODO' })
  create(@Body() dto: CreateImportDto) { return this.service.create(dto); }
  @Get(':id') findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }
}
