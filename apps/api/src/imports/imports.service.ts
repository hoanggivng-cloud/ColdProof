import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateImportDto } from './create-import.dto';
@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}
  status() { return { module: 'imports', status: 'TODO', message: 'Job metadata only. BullMQ dispatch and worker are TODO; QUEUED does not imply execution.' }; }
  async create(dto: CreateImportDto) {
    try { return await this.prisma.importJob.create({ data: dto }); }
    catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') throw new NotFoundException('Source not found'); throw e; }
  }
  async findOne(id: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Import not found');
    return job;
  }
}
