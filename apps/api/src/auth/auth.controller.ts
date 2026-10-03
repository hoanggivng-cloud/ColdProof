import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthStatusDto, LoginDto, LoginResponseDto, AuthUserDto } from './auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Get('status')
  @ApiOkResponse({ type: AuthStatusDto })
  @ApiOperation({ summary: 'Get auth module status' })
  status() {
    return this.service.status();
  }

  @Post('login')
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiOperation({ summary: 'Demo login with registered email (e.g. qa@coldproof.local, operator@coldproof.local)' })
  login(@Body() dto: LoginDto) {
    return this.service.login(dto);
  }

  @Get('me')
  @ApiOkResponse({ type: AuthUserDto })
  @ApiOperation({ summary: 'Get current authenticated user profile and active role' })
  me() {
    return this.service.me();
  }
}

