import { ApiProperty } from '@nestjs/swagger';
export class AdaptersStatusDto {
  @ApiProperty({ example: 'adapters' }) module!: string;
  @ApiProperty({ enum: ['TODO'] }) status!: 'TODO';
  @ApiProperty() message!: string;
}
