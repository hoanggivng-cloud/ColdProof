import { IsIn, IsInt, IsOptional, Min, Max } from 'class-validator';
export class SimulationDto {
  @IsIn(['NORMAL', 'EXCURSION', 'MISSING', 'CONFLICT']) scenario!: 'NORMAL' | 'EXCURSION' | 'MISSING' | 'CONFLICT';
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) seed?: number;
}
