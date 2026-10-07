import { ApiProperty } from '@nestjs/swagger';

export class UsersStatusDto {
  @ApiProperty({ example: 'users' }) module!: string;
  @ApiProperty({ enum: ['READY', 'TODO'] }) status!: string;
  @ApiProperty() message!: string;
}

export class UserDto {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000001' }) id!: string;
  @ApiProperty({ example: 'admin@coldproof.local' }) email!: string;
  @ApiProperty({ example: 'ADMIN', enum: ['ADMIN', 'DATA_ENGINEER', 'QA_REVIEWER', 'VIEWER'] }) role!: string;
  @ApiProperty() created_at!: Date;
}

