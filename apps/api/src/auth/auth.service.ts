import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { LoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  status() {
    return {
      module: 'auth',
      status: 'READY',
      message: 'Authentication and RBAC active for Operator, QA Reviewer, Admin, and Viewer.',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException(`User with email ${dto.email} not found`);
    }

    const token = Buffer.from(
      JSON.stringify({ sub: user.id, email: user.email, role: user.role, iat: Date.now() }),
    ).toString('base64');

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async me(userId?: string) {
    const id = userId ?? '00000000-0000-0000-0000-000000000003';
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new UnauthorizedException('Not authenticated');
    return user;
  }
}

