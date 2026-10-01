import { ApiProperty } from '@nestjs/swagger';
export class ImportsStatusDto {
  @ApiProperty({ example: 'imports' }) module!: string;
  @ApiProperty({ enum: ['TODO'] }) status!: 'TODO';
  @ApiProperty() message!: string;
}
