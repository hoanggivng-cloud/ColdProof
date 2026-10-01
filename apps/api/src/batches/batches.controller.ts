import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { BatchesService } from './batches.service';
import { BatchesStatusDto } from './batches.dto';
@ApiTags('batches')
@Controller('batches')
export class BatchesController {
  constructor(private readonly service: BatchesService) {}
  @Get('status') @ApiOkResponse({ type: BatchesStatusDto })
  status() { return this.service.status(); }
}
