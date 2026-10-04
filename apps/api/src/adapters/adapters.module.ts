import { Module } from '@nestjs/common';
import { AdaptersController } from './adapters.controller';
import { AdaptersService } from './adapters.service';
import { MendeleyAdapter } from './mendeley/mendeley.adapter';
import { ZenodoAdapter } from './zenodo/zenodo.adapter';

@Module({
  controllers: [AdaptersController],
  providers: [AdaptersService, MendeleyAdapter, ZenodoAdapter],
  exports: [AdaptersService, MendeleyAdapter, ZenodoAdapter],
})
export class AdaptersModule {}
