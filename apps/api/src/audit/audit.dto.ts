import { ApiProperty } from '@nestjs/swagger';
export class AuditStatusDto {
  @ApiProperty({ example: 'audit' }) module!: string;
  @ApiProperty({ enum: ['TODO'] }) status!: 'TODO';
  @ApiProperty() message!: string;
}
