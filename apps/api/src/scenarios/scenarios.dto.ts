import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ScenariosStatusDto {
  @ApiProperty({ example: 'scenarios' }) module!: string;
  @ApiProperty({ enum: ['TODO', 'READY'] }) status!: string;
  @ApiProperty() message!: string;
}

export class ScenarioResponseDto {
  @ApiProperty({ example: 'S02' }) id!: string;
  @ApiProperty({ example: 1 }) version!: number;
  @ApiProperty({ example: 'Handover heat excursion' }) name!: string;
  @ApiProperty() manifest!: Record<string, unknown>;
  @ApiProperty() created_at!: Date;
}

export class ScenarioBuildResultDto {
  @ApiProperty({ example: 'S02' }) scenario_id!: string;
  @ApiProperty({ example: 'CP-DEMO-001' }) batch_id!: string;
  @ApiProperty({ example: 3 }) segments_created!: number;
  @ApiProperty({ example: 'COMPLETE' }) status!: string;
  @ApiPropertyOptional() expected?: Record<string, unknown>;
}

