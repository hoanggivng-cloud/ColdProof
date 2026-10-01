import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ParsersService } from './parsers.service';
import { ParsersStatusDto } from './parsers.dto';
@ApiTags('parsers')
@Controller('parsers')
export class ParsersController {
  constructor(private readonly service: ParsersService) {}
  @Get('status') @ApiOkResponse({ type: ParsersStatusDto })
  status() { return this.service.status(); }
}
