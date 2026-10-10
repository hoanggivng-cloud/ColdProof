import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiCreatedResponse, ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { BatchesService } from './batches.service';
import {
  BatchesStatusDto,
  BatchSummaryDto,
  BatchDetailDto,
  CanonicalMeasurementDto,
  BatchExceptionsDto,
  CreateBatchDto,
} from './batches.dto';

@ApiTags('batches')
@Controller('batches')
export class BatchesController {
  constructor(private readonly service: BatchesService) {}

  @Get('status')
  @ApiOkResponse({ type: BatchesStatusDto })
  @ApiOperation({ summary: 'Get batches module status' })
  status() {
    return this.service.status();
  }

  @Get()
  @ApiOkResponse({ type: [BatchSummaryDto] })
  @ApiOperation({ summary: 'List all demo batches with health indicators' })
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @ApiCreatedResponse({ description: 'Batch created successfully' })
  @ApiOperation({ summary: 'Create a new batch with profile and assigned devices' })
  create(@Body() dto: CreateBatchDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: BatchDetailDto })
  @ApiParam({ name: 'id', example: 'CP-DEMO-001', description: 'Batch ID' })
  @ApiOperation({ summary: 'Get batch evidence view including segments and timeline' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/measurements')
  @ApiOkResponse({ type: [CanonicalMeasurementDto] })
  @ApiParam({ name: 'id', example: 'CP-DEMO-001', description: 'Batch ID' })
  @ApiOperation({ summary: 'Get canonical measurement stream for a batch' })
  findMeasurements(@Param('id') id: string) {
    return this.service.findMeasurements(id);
  }

  @Get(':id/exceptions')
  @ApiOkResponse({ type: BatchExceptionsDto })
  @ApiParam({ name: 'id', example: 'CP-DEMO-001', description: 'Batch ID' })
  @ApiOperation({ summary: 'Get exceptions and quality issues for a batch' })
  findExceptions(@Param('id') id: string) {
    return this.service.findExceptions(id);
  }

  @Post(':id/reports')
  @ApiParam({ name: 'id', example: 'CP-DEMO-001', description: 'Batch ID' })
  @ApiOperation({ summary: 'Generate evidence report package for a batch' })
  generateReport(@Param('id') id: string) {
    return this.service.generateReport(id);
  }
}

