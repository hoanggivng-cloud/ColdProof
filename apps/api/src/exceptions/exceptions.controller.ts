import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ExceptionsService } from './exceptions.service';
import {
  ExceptionsStatusDto,
  ExceptionResponseDto,
  ReviewActionDto,
  ReviewResponseDto,
} from './exceptions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

interface RequestWithUser {
  user?: { id?: string; email?: string; role?: string };
}

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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('QA_REVIEWER', 'ADMIN')
  @ApiBearerAuth()
  @ApiOkResponse({ type: ReviewResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid authentication token' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions (Operator cannot review)' })
  @ApiParam({ name: 'id', example: 'e1111111-1111-1111-1111-111111111111', description: 'Exception UUID' })
  @ApiOperation({ summary: 'Submit QA review action, notes, and corrective action (Restricted to QA_REVIEWER & ADMIN)' })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewActionDto,
    @Req() req: RequestWithUser,
  ) {
    const reviewerId = dto.reviewer_id ?? req.user?.id;
    return this.service.review(id, { ...dto, reviewer_id: reviewerId });
  }
}
