import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  status() {
    return {
      module: 'audit',
      status: 'READY',
      message: 'Immutable audit trail active. Append-only audit logging for system actions.',
    };
  }

  async findAll() {
    return await this.prisma.auditEvent.findMany({
      orderBy: { created_at: 'desc' },
      take: 100,
    });
  }
}

