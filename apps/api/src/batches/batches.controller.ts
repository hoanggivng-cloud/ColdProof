import { Controller, Get, Param, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { BatchesService } from './batches.service';
import {
  BatchesStatusDto,
  BatchSummaryDto,
  BatchDetailDto,
  CanonicalMeasurementDto,
  BatchExceptionsDto,
  CreateBatchDto,
} from './batches.dto';
import { SimulationDto } from './simulation.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface RequestWithUser {
  user?: { id?: string; email?: string; role?: string };
}

@ApiTags('batches')
@UseGuards(JwtAuthGuard, RolesGuard)
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

  @Roles("OPERATOR", "ADMIN")
  @Post()
  @ApiOperation({ summary: 'Create a new batch' })
  create(@Body() dto: CreateBatchDto) {
    return this.service.create(dto);
  }

  @Post(':id/handover')
  @Roles('OPERATOR', 'ADMIN')
  handover(@Param('id') id: string, @Body() dto: CreateBatchDto, @Req() req: RequestWithUser) { return this.service.saveHandover(id, dto.context ?? {}, req.user?.id); }

  @Post(':id/simulate')
  @Roles('OPERATOR', 'ADMIN')
  simulate(@Param('id') id: string, @Body() dto: SimulationDto, @Req() req: RequestWithUser) { return this.service.simulate(id, dto, req.user?.id); }

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

  @Roles('QA_REVIEWER', 'ADMIN')
  @Post(':id/reports')
  @UseGuards(JwtAuthGuard)
  @ApiParam({ name: 'id', example: 'CP-DEMO-001', description: 'Batch ID' })
  @ApiOperation({ summary: 'Generate evidence report package for a batch' })
  generateReport(@Param('id') id: string, @Req() req: RequestWithUser) {
    const userEmail = req.user?.email || 'system@coldproof.local';
    return this.service.generateReport(id, userEmail);
  }
}

