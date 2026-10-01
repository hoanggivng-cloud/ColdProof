import { ApiProperty } from '@nestjs/swagger';
export class UsersStatusDto {
  @ApiProperty({ example: 'users' }) module!: string;
  @ApiProperty({ enum: ['TODO'] }) status!: 'TODO';
  @ApiProperty() message!: string;
}
