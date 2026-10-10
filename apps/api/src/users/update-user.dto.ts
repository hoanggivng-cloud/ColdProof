import { IsBoolean, IsIn, IsOptional } from 'class-validator';
export class UpdateUserDto {
  @IsOptional() @IsIn(['OPERATOR', 'QA_REVIEWER', 'ADMIN']) role?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
