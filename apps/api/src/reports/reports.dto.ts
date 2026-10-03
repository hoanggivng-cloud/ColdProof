import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReportsStatusDto {
  @ApiProperty({ example: 'reports' }) module!: string;
  @ApiProperty({ enum: ['READY', 'TODO'] }) status!: string;
  @ApiProperty() message!: string;
}

export class ReportSummaryDto {
  @ApiProperty({ example: '77777777-7777-7777-7777-777777777771' }) id!: string;
  @ApiProperty({ example: 'CP-DEMO-001' }) batch_id!: string;
  @ApiProperty({ example: 1 }) version!: number;
  @ApiPropertyOptional({ example: '/api/reports/77777777-7777-7777-7777-777777777771/download' }) uri?: string | null;
  @ApiPropertyOptional({ example: 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3000000000000000000000000' }) checksum_sha256?: string | null;
  @ApiProperty() provenance!: Record<string, unknown>;
  @ApiProperty() created_at!: Date;
}

