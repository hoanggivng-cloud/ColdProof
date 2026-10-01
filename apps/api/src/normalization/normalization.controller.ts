import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { NormalizationService } from './normalization.service';
import { NormalizationStatusDto } from './normalization.dto';
@ApiTags('normalization')
@Controller('normalization')
export class NormalizationController {
  constructor(private readonly service: NormalizationService) {}
  @Get('status') @ApiOkResponse({ type: NormalizationStatusDto })
  status() { return this.service.status(); }
}
