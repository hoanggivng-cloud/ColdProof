import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { HealthController } from './common/health.controller';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SourcesModule } from './sources/sources.module';
import { ImportsModule } from './imports/imports.module';
import { AdaptersModule } from './adapters/adapters.module';
import { ParsersModule } from './parsers/parsers.module';
import { NormalizationModule } from './normalization/normalization.module';
import { DataQualityModule } from './data-quality/data-quality.module';
import { ScenariosModule } from './scenarios/scenarios.module';
import { BatchesModule } from './batches/batches.module';
import { ExceptionsModule } from './exceptions/exceptions.module';
import { QAReviewsModule } from './qa-reviews/qa-reviews.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }), CommonModule, AuthModule, UsersModule, SourcesModule, ImportsModule, AdaptersModule, ParsersModule, NormalizationModule, DataQualityModule, ScenariosModule, BatchesModule, ExceptionsModule, QAReviewsModule, ReportsModule, AuditModule], controllers: [HealthController] })
export class AppModule {}
