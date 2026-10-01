import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SourcesService } from './sources.service';
import { CreateSourceDto } from './create-source.dto';
@ApiTags('sources') @Controller('sources')
export class SourcesController {
  constructor(private readonly service: SourcesService) {}
  @Get('status') status() { return this.service.status(); }
  @Post() @ApiOperation({ summary: 'Register immutable source metadata; content upload/verification TODO' })
  create(@Body() dto: CreateSourceDto) { return this.service.create(dto); }
  @Get(':id') findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findOne(id); }
}
