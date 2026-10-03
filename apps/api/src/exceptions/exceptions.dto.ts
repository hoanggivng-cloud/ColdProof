import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ExceptionsStatusDto {
  @ApiProperty({ example: 'exceptions' }) module!: string;
  @ApiProperty({ enum: ['READY', 'TODO'] }) status!: string;
  @ApiProperty() message!: string;
}

export class ExceptionResponseDto {
  @ApiProperty({ example: 'e1111111-1111-1111-1111-111111111111' }) id!: string;
  @ApiProperty({ example: 'CP-DEMO-001' }) batch_id!: string;
  @ApiProperty({ example: ['M-07', 'M-08', 'M-09'] }) record_ids!: string[];
  @ApiProperty({ example: 'DEMO_2_8C' }) profile_id!: string;
  @ApiProperty({ example: 'PENDING_REVIEW' }) status!: string;
  @ApiProperty() created_at!: Date;
}

export class ReviewActionDto {
  @ApiProperty({ enum: ['REVIEWED', 'NEEDS_EVIDENCE', 'REJECTED'], example: 'REVIEWED' })
  @IsEnum(['REVIEWED', 'NEEDS_EVIDENCE', 'REJECTED'])
  status!: 'REVIEWED' | 'NEEDS_EVIDENCE' | 'REJECTED';

  @ApiPropertyOptional({ example: '00000000-0000-0000-0000-000000000003' })
  @IsOptional()
  @IsUUID()
  reviewer_id?: string;

  @ApiPropertyOptional({ example: 'Reviewed temperature excursion during handover.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'Quarantine batch and verify secondary logger.' })
  @IsOptional()
  @IsString()
  corrective_action?: string;
}

export class ReviewResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() exception_id!: string;
  @ApiProperty() reviewer_id!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional() notes?: string;
  @ApiProperty() created_at!: Date;
}

