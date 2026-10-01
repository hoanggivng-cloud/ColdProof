import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { QAReviewsService } from './qa-reviews.service';
import { QAReviewsStatusDto } from './qa-reviews.dto';
@ApiTags('qa-reviews')
@Controller('qa-reviews')
export class QAReviewsController {
  constructor(private readonly service: QAReviewsService) {}
  @Get('status') @ApiOkResponse({ type: QAReviewsStatusDto })
  status() { return this.service.status(); }
}
