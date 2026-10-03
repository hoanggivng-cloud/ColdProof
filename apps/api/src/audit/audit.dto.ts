import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditStatusDto {
  @ApiProperty({ example: 'audit' }) module!: string;
  @ApiProperty({ enum: ['READY', 'TODO'] }) status!: string;
  @ApiProperty() message!: string;
}

export class AuditEventDto {
  @ApiProperty({ example: '66666666-6666-6666-6666-666666666661' }) id!: string;
  @ApiPropertyOptional({ example: '00000000-0000-0000-0000-000000000002' }) actor_id?: string | null;
  @ApiProperty({ example: 'IMPORT_COMPLETED' }) action!: string;
  @ApiProperty({ example: 'source_assets' }) entity_type!: string;
  @ApiProperty({ example: '11111111-1111-1111-1111-111111111111' }) entity_id!: string;
  @ApiProperty() payload!: Record<string, unknown>;
  @ApiProperty() created_at!: Date;
}

