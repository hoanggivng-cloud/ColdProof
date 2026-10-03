import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CreateSourceDto } from './create-source.dto';

@Injectable()
export class SourcesService {
  constructor(private readonly prisma: PrismaService) {}

  status() {
    return {
      module: 'sources',
      status: 'READY',
      message: 'Source registry and provenance layer active.',
    };
  }

  async create(dto: CreateSourceDto) {
    try {
      return await this.prisma.sourceAsset.create({ data: dto });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Dataset/file/version is already registered');
      }
      throw e;
    }
  }

  async findAll() {
    return await this.prisma.sourceAsset.findMany({
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: string) {
    const source = await this.prisma.sourceAsset.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Source not found');
    return source;
  }
}
