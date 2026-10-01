import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ScenariosService } from './scenarios.service';
import { ScenariosStatusDto } from './scenarios.dto';
@ApiTags('scenarios')
@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly service: ScenariosService) {}
  @Get('status') @ApiOkResponse({ type: ScenariosStatusDto })
  status() { return this.service.status(); }
}
