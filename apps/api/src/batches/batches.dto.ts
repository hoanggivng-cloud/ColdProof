import { ApiProperty } from '@nestjs/swagger';
export class BatchesStatusDto {
  @ApiProperty({ example: 'batches' }) module!: string;
  @ApiProperty({ enum: ['TODO'] }) status!: 'TODO';
  @ApiProperty() message!: string;
}
