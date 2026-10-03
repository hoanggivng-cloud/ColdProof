import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AuthStatusDto {
  @ApiProperty({ example: 'auth' }) module!: string;
  @ApiProperty({ enum: ['READY', 'TODO'] }) status!: string;
  @ApiProperty() message!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'qa@coldproof.local' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiPropertyOptional({ example: 'demo123' })
  @IsOptional()
  @IsString()
  password?: string;
}

export class AuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() role!: string;
}

export class LoginResponseDto {
  @ApiProperty({ example: 'mock-jwt-token-demo' })
  access_token!: string;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

