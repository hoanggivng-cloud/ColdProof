import { ApiProperty } from '@nestjs/swagger';
export class NormalizationStatusDto {
  @ApiProperty({ example: 'normalization' }) module!: string;
  @ApiProperty({ enum: ['TODO'] }) status!: 'TODO';
  @ApiProperty() message!: string;
}
