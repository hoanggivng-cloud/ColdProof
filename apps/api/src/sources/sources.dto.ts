import { ApiProperty } from '@nestjs/swagger';
export class SourcesStatusDto {
  @ApiProperty({ example: 'sources' }) module!: string;
  @ApiProperty({ enum: ['TODO'] }) status!: 'TODO';
  @ApiProperty() message!: string;
}
