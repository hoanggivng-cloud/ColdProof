import { UseGuards as Protect } from '@nestjs/common';
import { JwtAuthGuard as AuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard as AccessGuard } from '../auth/guards/roles.guard';
import { Roles as AllowRoles } from '../auth/decorators/roles.decorator';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { UpdateUserDto } from './update-user.dto';
import { UsersService } from './users.service';
import { UsersStatusDto, UserDto } from './users.dto';

@ApiTags('users')
@Protect(AuthGuard, AccessGuard)
@AllowRoles('ADMIN')
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

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @Req() req: { user: { id: string } }) { return this.service.update(id, dto, req.user.id); }

  @Get(':id')
  @ApiParam({ name: 'id', example: '00000000-0000-0000-0000-000000000001', description: 'User UUID' })
  @ApiOperation({ summary: 'Get user details by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }
}

