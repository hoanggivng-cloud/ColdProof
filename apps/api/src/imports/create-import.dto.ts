import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
export class CreateImportDto {
  @ApiProperty() @IsString() source_id!: string;
  @ApiProperty({ enum: ['format-a', 'format-b', 'format-c'] }) @IsIn(['format-a', 'format-b', 'format-c']) parser_id!: string;
  @ApiProperty({ enum: ['0.1.0'] }) @IsIn(['0.1.0']) parser_version!: string;
}
