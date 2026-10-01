import { Module } from '@nestjs/common';
import { QAReviewsController } from './qa-reviews.controller';
import { QAReviewsService } from './qa-reviews.service';
@Module({ controllers: [QAReviewsController], providers: [QAReviewsService], exports: [QAReviewsService] })
export class QAReviewsModule {}
