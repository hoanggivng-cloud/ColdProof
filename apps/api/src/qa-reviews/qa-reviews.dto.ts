import { ApiProperty } from '@nestjs/swagger';
export class QAReviewsStatusDto {
  @ApiProperty({ example: 'qa-reviews' }) module!: string;
  @ApiProperty({ enum: ['TODO'] }) status!: 'TODO';
  @ApiProperty() message!: string;
}
