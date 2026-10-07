import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UsersStatusDto, UserDto } from './users.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get('status')
  @ApiOkResponse({ type: UsersStatusDto })
  @ApiOperation({ summary: 'Get users module status' })
  status() {
    return this.service.status();
  }

  @Get()
  @ApiOkResponse({ type: [UserDto] })
  @ApiOperation({ summary: 'List all registered users and RBAC roles' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiParam({ name: 'id', example: '00000000-0000-0000-0000-000000000001', description: 'User UUID' })
  @ApiOperation({ summary: 'Get user details by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }
}

