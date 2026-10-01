import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UsersStatusDto } from './users.dto';
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}
  @Get('status') @ApiOkResponse({ type: UsersStatusDto })
  status() { return this.service.status(); }
}
