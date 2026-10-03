import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { ExceptionsService } from './exceptions.service';
import {
  ExceptionsStatusDto,
  ExceptionResponseDto,
  ReviewActionDto,
  ReviewResponseDto,
} from './exceptions.dto';

@ApiTags('exceptions')
@Controller('exceptions')
export class ExceptionsController {
  constructor(private readonly service: ExceptionsService) {}

  @Get('status')
  @ApiOkResponse({ type: ExceptionsStatusDto })
  @ApiOperation({ summary: 'Get exceptions module status' })
  status() {
    return this.service.status();
  }

  @Get()
  @ApiOkResponse({ type: [ExceptionResponseDto] })
  @ApiOperation({ summary: 'List all detected exceptions across batches' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiParam({ name: 'id', example: 'e1111111-1111-1111-1111-111111111111', description: 'Exception UUID' })
  @ApiOperation({ summary: 'Get exception details and review history' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/review')
  @ApiOkResponse({ type: ReviewResponseDto })
  @ApiParam({ name: 'id', example: 'e1111111-1111-1111-1111-111111111111', description: 'Exception UUID' })
  @ApiOperation({ summary: 'Submit QA review action, notes, and corrective action' })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewActionDto,
  ) {
    return this.service.review(id, dto);
  }
}

