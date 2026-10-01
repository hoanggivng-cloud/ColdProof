import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ExceptionsService } from './exceptions.service';
import { ExceptionsStatusDto } from './exceptions.dto';
@ApiTags('exceptions')
@Controller('exceptions')
export class ExceptionsController {
  constructor(private readonly service: ExceptionsService) {}
  @Get('status') @ApiOkResponse({ type: ExceptionsStatusDto })
  status() { return this.service.status(); }
}
