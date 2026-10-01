import { ApiProperty } from '@nestjs/swagger';
export class ReportsStatusDto {
  @ApiProperty({ example: 'reports' }) module!: string;
  @ApiProperty({ enum: ['TODO'] }) status!: 'TODO';
  @ApiProperty() message!: string;
}
