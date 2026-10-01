import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
export class CreateSourceDto {
  @ApiProperty() @IsString() @IsNotEmpty() dataset!: string;
  @ApiProperty() @IsString() @IsNotEmpty() file_name!: string;
  @ApiProperty({ description: 'SHA-256 supplied by caller; content verification is TODO' }) @Matches(/^[a-f0-9]{64}$/) checksum_sha256!: string;
  @ApiProperty() @IsString() @IsNotEmpty() version!: string;
  @ApiProperty({ enum: ['REAL_PUBLIC_DATA', 'DERIVED', 'SYNTHETIC'] }) @IsEnum({ REAL_PUBLIC_DATA: 'REAL_PUBLIC_DATA', DERIVED: 'DERIVED', SYNTHETIC: 'SYNTHETIC' }) origin!: 'REAL_PUBLIC_DATA' | 'DERIVED' | 'SYNTHETIC';
  @ApiPropertyOptional() @IsOptional() @IsString() uri?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() license_ref?: string;
}
