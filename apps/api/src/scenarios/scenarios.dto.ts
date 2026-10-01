import { ApiProperty } from '@nestjs/swagger';
export class ScenariosStatusDto {
  @ApiProperty({ example: 'scenarios' }) module!: string;
  @ApiProperty({ enum: ['TODO'] }) status!: 'TODO';
  @ApiProperty() message!: string;
}
