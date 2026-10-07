import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PrismaService } from '../../common/prisma.service';
import type { Role } from '@coldproof/shared-types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new UnauthorizedException('User is not authenticated');
    }

    const hasRole = requiredRoles.includes(user.role as Role);

    if (!hasRole) {
      // Guardrail 5 (RBAC Guard): Log unauthorized access attempt to audit_events
      try {
        await this.prisma.auditEvent.create({
          data: {
            action: 'UNAUTHORIZED_REVIEW_ATTEMPT',
            entity_type: 'exceptions',
            entity_id: request.params?.id ?? 'UNKNOWN',
            payload: {
              user_id: user.id,
              email: user.email,
              role: user.role,
              required_roles: requiredRoles,
              endpoint: request.url,
              method: request.method,
            },
          },
        });
      } catch (err) {
        // Continue even if audit write encounters transient issue
      }

      throw new ForbiddenException(
        `Forbidden resource: Role '${user.role}' is not authorized to access this resource`
      );
    }

    return true;
  }
}

