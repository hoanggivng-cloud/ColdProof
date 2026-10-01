import { ApiProperty } from '@nestjs/swagger';
export class ExceptionsStatusDto {
  @ApiProperty({ example: 'exceptions' }) module!: string;
  @ApiProperty({ enum: ['TODO'] }) status!: 'TODO';
  @ApiProperty() message!: string;
}
