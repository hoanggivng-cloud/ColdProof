import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdaptersService } from './adapters.service';
import { AdaptersStatusDto } from './adapters.dto';
@ApiTags('adapters')
@Controller('adapters')
export class AdaptersController {
  constructor(private readonly service: AdaptersService) {}
  @Get('status') @ApiOkResponse({ type: AdaptersStatusDto })
  status() { return this.service.status(); }
}
