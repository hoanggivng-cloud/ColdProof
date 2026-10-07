import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QAReviewsStatusDto {
  @ApiProperty({ example: 'qa-reviews' }) module!: string;
  @ApiProperty({ enum: ['READY', 'TODO'] }) status!: string;
  @ApiProperty() message!: string;
}

export class QAReviewItemDto {
  @ApiProperty({ example: '88888888-8888-8888-8888-888888888881' }) id!: string;
  @ApiProperty({ example: 'e1111111-1111-1111-1111-111111111111' }) exception_id!: string;
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000003' }) reviewer_id!: string;
  @ApiProperty({ example: 'REVIEWED' }) status!: string;
  @ApiPropertyOptional({ example: 'Reviewed by QA' }) notes?: string | null;
  @ApiProperty() created_at!: Date;
}

