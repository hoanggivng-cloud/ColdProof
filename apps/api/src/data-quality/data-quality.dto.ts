import { ApiProperty } from '@nestjs/swagger';
export class DataQualityStatusDto {
  @ApiProperty({ example: 'data-quality' }) module!: string;
  @ApiProperty({ enum: ['TODO'] }) status!: 'TODO';
  @ApiProperty() message!: string;
}
