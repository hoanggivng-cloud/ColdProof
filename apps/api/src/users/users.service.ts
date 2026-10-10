import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UpdateUserDto } from './update-user.dto';
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
        active: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    if (id === actorId && (dto.active === false || (dto.role && dto.role !== 'ADMIN'))) throw new BadRequestException('Không tự khóa hoặc thu hồi quyền Admin của mình');
    return this.prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id } });
      if (!user) throw new NotFoundException('User not found');
      await tx.user.update({ where: { id }, data: dto });
      await tx.auditEvent.create({ data: { actor_id: actorId, action: 'USER_ACCESS_UPDATED', entity_type: 'users', entity_id: id, payload: { ...dto } } });
      return { id, role: dto.role ?? user.role, active: dto.active ?? user.active };
    });
  }
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        created_at: true,
      },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }
}

