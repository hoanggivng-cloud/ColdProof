import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBatchDto {
  @ApiPropertyOptional({ example: 'S02' }) scenario_id?: string;
  @ApiPropertyOptional({ example: 'DEMO_2_8C' }) profile_id?: string;
  @ApiPropertyOptional({ example: 2.0 }) lower_threshold?: number;
  @ApiPropertyOptional({ example: 8.0 }) upper_threshold?: number;
  @ApiProperty({ type: [String] }) device_ids!: string[];
}
