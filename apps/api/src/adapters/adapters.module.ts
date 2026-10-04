import { Module } from '@nestjs/common';
import { AdaptersController } from './adapters.controller';
import { AdaptersService } from './adapters.service';
import { ZenodoAdapter } from './zenodo/zenodo.adapter';

@Module({
  controllers: [AdaptersController],
  providers: [AdaptersService, ZenodoAdapter],
  exports: [AdaptersService, ZenodoAdapter],
})
export class AdaptersModule {}
