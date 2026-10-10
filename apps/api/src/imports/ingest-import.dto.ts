import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class IngestRecordDto {
  @ApiPropertyOptional()
  @IsOptional()
  source_ref?: string;

  @ApiPropertyOptional()
  @IsOptional()
  timestamp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  temp_c?: number;

  @ApiPropertyOptional()
  @IsOptional()
  humidity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  device_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  flag?: string;

  @ApiPropertyOptional()
  @IsOptional()
  detail?: string;
}

export class IngestImportDto {
  @ApiProperty({ description: 'Mã định danh lô hàng (Batch ID) để gắn số đo' })
  @IsString()
  @IsNotEmpty()
  batch_id!: string;

  @ApiPropertyOptional({ description: 'Định dạng dữ liệu nguồn (LOGGER_A, LOGGER_B, ZENODO_CSV, CP_DEMO)' })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional({ description: 'Mã thiết bị ghi nhận' })
  @IsOptional()
  @IsString()
  device_id?: string;

  @ApiPropertyOptional({ description: 'Tên file hoặc nguồn dữ liệu' })
  @IsOptional()
  @IsString()
  file_name?: string;

  @ApiPropertyOptional({ description: 'Nội dung thô payload' })
  @IsOptional()
  @IsString()
  raw_payload?: string;

  @ApiPropertyOptional({ description: 'Danh sách các dòng số đo đã xử lý/chuẩn bị sẵn', type: [IngestRecordDto] })
  @IsOptional()
  records?: IngestRecordDto[];
}
