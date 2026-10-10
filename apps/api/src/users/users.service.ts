import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  status() {
    return {
      module: 'users',
      status: 'READY',
      message: 'User registry active with role-based definitions.',
    };
  }

  async findAll() {
    return await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        created_at: true,
      },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }
}

