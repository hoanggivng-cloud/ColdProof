import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DataQualityService } from './data-quality.service';
import { DataQualityStatusDto } from './data-quality.dto';
@ApiTags('data-quality')
@Controller('data-quality')
export class DataQualityController {
  constructor(private readonly service: DataQualityService) {}
  @Get('status') @ApiOkResponse({ type: DataQualityStatusDto })
  status() { return this.service.status(); }
}
