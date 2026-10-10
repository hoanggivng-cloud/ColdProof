import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateImportDto } from './create-import.dto';
@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}
  status() { return { module: 'imports', status: 'TODO', message: 'Job metadata only. BullMQ dispatch and worker are TODO; QUEUED does not imply execution.' }; }
  async create(dto: CreateImportDto) {
    try { 
      // Ensure we have a valid source_id to prevent P2003 foreign key error
      let validSourceId = dto.source_id;
      const sourceExists = await this.prisma.sourceAsset.findUnique({ where: { id: validSourceId } });
      if (!sourceExists) {
        const anySource = await this.prisma.sourceAsset.findFirst();
        if (anySource) validSourceId = anySource.id;
      }

      const job = await this.prisma.importJob.create({ 
        data: {
          source_id: validSourceId,
          parser_id: dto.parser_id,
          parser_version: dto.parser_version
        } 
      }); 

      // This endpoint registers metadata only. Demo readings use batches/:id/simulate.

      return job;
    }
    catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') throw new NotFoundException('Source not found'); throw e; }
  }

  async findOne(id: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Import not found');
    return job;
  }
}
