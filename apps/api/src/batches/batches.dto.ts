import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, IsObject, ArrayMaxSize } from 'class-validator';

export class BatchesStatusDto {
  @ApiProperty({ example: 'batches' }) module!: string;
  @ApiProperty({ enum: ['READY', 'TODO'] }) status!: string;
  @ApiProperty() message!: string;
}

export class BatchSummaryDto {
  @ApiProperty({ example: 'CP-DEMO-001' }) id!: string;
  @ApiPropertyOptional({ example: 'S02' }) scenario_id?: string;
  @ApiProperty({ example: 'EXCEPTION' }) status!: 'NORMAL' | 'EXCEPTION' | 'MISSING' | 'CONFLICT';
  @ApiProperty({ example: 3 }) segments_count!: number;
  @ApiPropertyOptional({ example: 'DEMO_2_8C' }) profile_id?: string;
  @ApiPropertyOptional({ example: 2.0 }) lower_threshold?: number;
  @ApiPropertyOptional({ example: 8.0 }) upper_threshold?: number;
  @ApiProperty() created_at!: Date;
}

export class SegmentDto {
  @ApiProperty({ example: 'LEG-01' }) id!: string;
  @ApiProperty({ example: 'CP-DEMO-001' }) batch_id!: string;
  @ApiPropertyOptional() source_id?: string;
  @ApiProperty({ example: 'stable_window_A' }) selector!: string;
  @ApiPropertyOptional({ example: 'HANDOVER-01' }) handover_id?: string | null;
  @ApiPropertyOptional({ example: 'SENSOR06' }) device_alias?: string;
  @ApiProperty({ example: 'SYNTHETIC' }) business_context_origin!: string;
}

export class TimelineEventDto {
  @ApiProperty({ example: 'TL-01' }) id!: string;
  @ApiProperty({ example: '2026-10-01T08:00:00.000Z' }) timestamp!: string;
  @ApiProperty({
    enum: ['SEGMENT_START', 'HANDOVER', 'DOOR_OPEN', 'EXCURSION_START', 'EXCURSION_END', 'SEGMENT_END'],
    example: 'HANDOVER',
  })
  event_type!: 'SEGMENT_START' | 'HANDOVER' | 'DOOR_OPEN' | 'EXCURSION_START' | 'EXCURSION_END' | 'SEGMENT_END';
  @ApiPropertyOptional({ example: 'HANDOVER-01' }) handover_id?: string;
  @ApiPropertyOptional({ example: 'LEG-02' }) segment_id?: string;
  @ApiPropertyOptional({ example: 'SENSOR06' }) device_alias?: string;
  @ApiProperty({ example: 'Handover transfer from storage room to transport vehicle' }) detail!: string;
  @ApiProperty({ example: 'SYNTHETIC' }) business_context_origin!: string;
}

export class BatchDetailDto {
  @ApiProperty({ example: 'CP-DEMO-001' }) id!: string;
  @ApiPropertyOptional({ example: 'S02' }) scenario_id?: string;
  @ApiProperty({ example: 'SYNTHETIC' }) business_context_origin!: string;
  @ApiPropertyOptional({ example: 'DEMO_2_8C' }) profile_id?: string;
  @ApiPropertyOptional({ example: 2.0 }) lower_threshold?: number;
  @ApiPropertyOptional({ example: 8.0 }) upper_threshold?: number;
  @ApiProperty({ type: [SegmentDto] }) segments!: SegmentDto[];
  @ApiProperty({ type: [TimelineEventDto] }) timeline!: TimelineEventDto[];
  @ApiPropertyOptional({ type: [TimelineEventDto] }) operational_events?: TimelineEventDto[];
  @ApiProperty() created_at!: Date;
}

export class CanonicalMeasurementDto {
  @ApiProperty({ example: 'M-01' }) record_id!: string;
  @ApiPropertyOptional({ example: 'S02' }) scenario_id?: string;
  @ApiPropertyOptional({ example: 'CP-DEMO-001' }) batch_id?: string;
  @ApiPropertyOptional({ example: 'LEG-01' }) segment_id?: string;
  @ApiPropertyOptional() timestamp?: Date;
  @ApiPropertyOptional({ example: 4.8 }) temperature_c?: number;
  @ApiPropertyOptional({ example: 45.2 }) humidity_pct?: number;
  @ApiProperty({ example: 'Zenodo - Cold Storage Room Monitoring (2025)' }) source_dataset!: string;
  @ApiProperty({ example: 'SENSOR06_raw.csv' }) source_file!: string;
  @ApiPropertyOptional({ example: 'SENSOR06' }) source_sensor_id?: string;
  @ApiProperty({ example: 'row_1' }) source_row_or_ref!: string;
  @ApiProperty({ example: 'FORMAT-A' }) source_format!: string;
  @ApiProperty({ example: 'zenodo-timeseries-adapter' }) parser_id!: string;
  @ApiProperty({ example: '1.0.0' }) parser_version!: string;
  @ApiProperty({ example: 'REAL_PUBLIC_DATA' }) measurement_origin!: string;
  @ApiProperty({ example: 'SYNTHETIC' }) business_context_origin!: string;
  @ApiProperty({ example: false }) missing_flag!: boolean;
  @ApiProperty({ example: false }) duplicate_flag!: boolean;
  @ApiProperty({ example: false }) conflict_flag!: boolean;
  @ApiPropertyOptional({ example: false }) excursion_flag?: boolean;
  @ApiPropertyOptional() exception_id?: string;
  @ApiPropertyOptional() review_status?: string;
}

export class BatchExceptionsDto {
  @ApiProperty() exceptions!: Record<string, unknown>[];
  @ApiProperty() quality_issues!: Record<string, unknown>[];
}

export class CreateBatchDto {
  @ApiPropertyOptional() @IsOptional() @IsObject() context?: Record<string, unknown>;
  @ApiProperty({ example: 'VX-2026-0418', description: 'Unique batch lot identifier' })
  @IsString()
  id!: string;

  @ApiPropertyOptional({ example: 'S02' })
  @IsOptional()
  @IsString()
  scenario_id?: string;

  @ApiPropertyOptional({ example: 'DEMO_2_8C' })
  @IsOptional()
  @IsString()
  profile_id?: string;

  @ApiPropertyOptional({ example: 2.0 })
  @IsOptional()
  @IsNumber()
  lower_threshold?: number;

  @ApiPropertyOptional({ example: 8.0 })
  @IsOptional()
  @IsNumber()
  upper_threshold?: number;

  @ApiPropertyOptional({ example: 'SYNTHETIC' })
  @IsOptional()
  @IsString()
  business_context_origin?: string;

  @ApiPropertyOptional({ example: ['SENSOR06'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true }) @ArrayMaxSize(8)
  device_ids?: string[];
}
