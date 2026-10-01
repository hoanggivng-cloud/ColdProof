import { ApiProperty } from '@nestjs/swagger';
export class AuthStatusDto {
  @ApiProperty({ example: 'auth' }) module!: string;
  @ApiProperty({ enum: ['TODO'] }) status!: 'TODO';
  @ApiProperty() message!: string;
}
