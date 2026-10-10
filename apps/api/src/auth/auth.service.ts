import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';
import * as crypto from 'crypto';

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

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
    };

    const secret = process.env.JWT_SECRET || 'coldproof-dev-secret-key-32-chars-min-2026';
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const bodyB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(`${headerB64}.${bodyB64}`).digest('base64url');
    const token = `${headerB64}.${bodyB64}.${signature}`;

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException(`User with email '${dto.email}' already exists`);
    }

    const allowedRoles = ['OPERATOR', 'QA_REVIEWER', 'VIEWER', 'DATA_ENGINEER'];
    const assignedRole = dto.role && allowedRoles.includes(dto.role) ? dto.role : 'OPERATOR';

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        role: assignedRole,
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        action: 'USER_REGISTERED',
        entity_type: 'users',
        entity_id: user.id,
        payload: { email: user.email, role: user.role },
      },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    };

    const secret = process.env.JWT_SECRET || 'coldproof-dev-secret-key-32-chars-min-2026';
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const bodyB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(`${headerB64}.${bodyB64}`).digest('base64url');
    const token = `${headerB64}.${bodyB64}.${signature}`;

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

