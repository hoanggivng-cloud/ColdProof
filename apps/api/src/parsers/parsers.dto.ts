import { ApiProperty } from '@nestjs/swagger';
export class ParsersStatusDto {
  @ApiProperty({ example: 'parsers' }) module!: string;
  @ApiProperty({ enum: ['TODO'] }) status!: 'TODO';
  @ApiProperty() message!: string;
}
