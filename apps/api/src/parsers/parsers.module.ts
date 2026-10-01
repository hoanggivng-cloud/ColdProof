import { Module } from '@nestjs/common';
import { ParsersController } from './parsers.controller';
import { ParsersService } from './parsers.service';
@Module({ controllers: [ParsersController], providers: [ParsersService], exports: [ParsersService] })
export class ParsersModule {}
