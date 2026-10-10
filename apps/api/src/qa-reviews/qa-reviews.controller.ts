import { UseGuards as Protect } from '@nestjs/common';
import { JwtAuthGuard as AuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard as AccessGuard } from '../auth/guards/roles.guard';
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { QAReviewsService } from './qa-reviews.service';
import { QAReviewsStatusDto, QAReviewItemDto } from './qa-reviews.dto';

@ApiTags('qa-reviews')
@Protect(AuthGuard, AccessGuard)
@Controller('qa-reviews')
export class QAReviewsController {
  constructor(private readonly service: QAReviewsService) {}

  @Get('status')
  @ApiOkResponse({ type: QAReviewsStatusDto })
  @ApiOperation({ summary: 'Get QA reviews module status' })
  status() {
    return this.service.status();
  }

  @Get()
  @ApiOkResponse({ type: [QAReviewItemDto] })
  @ApiOperation({ summary: 'List all QA review decisions' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiParam({ name: 'id', example: '88888888-8888-8888-8888-888888888881', description: 'Review UUID' })
  @ApiOperation({ summary: 'Get QA review details by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }
}

