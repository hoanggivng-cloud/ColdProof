import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class QAReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  status() {
    return {
      module: 'qa-reviews',
      status: 'READY',
      message: 'QA Review layer active. Human-in-the-loop decisions recorded with provenance audit.',
    };
  }

  async findAll() {
    return await this.prisma.review.findMany({
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
    });
    if (!review) throw new NotFoundException(`Review ${id} not found`);
    return review;
  }
}

