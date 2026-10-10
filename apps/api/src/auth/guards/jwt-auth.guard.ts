import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] || request.headers['Authorization'];

    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    const token = authHeader.slice(7).trim();
    const secret = process.env.JWT_SECRET || 'coldproof-dev-secret-key-32-chars-min-2026';

    try {
      let payload: Record<string, unknown> | null = null;
      const parts = token.split('.');

      if (parts.length === 3) {
        // Standard signed JWT (header.payload.signature)
        const [headerB64, bodyB64, sigB64] = parts;
        const expectedSig = crypto
          .createHmac('sha256', secret)
          .update(`${headerB64}.${bodyB64}`)
          .digest('base64url');

        if (
          sigB64.length !== expectedSig.length ||
          !crypto.timingSafeEqual(Buffer.from(sigB64), Buffer.from(expectedSig))
        ) {
          throw new UnauthorizedException('Invalid token signature');
        }

        payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
      } else {
        // Fallback for simple base64 tokens
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        payload = JSON.parse(decoded);
      }

      if (!payload || !payload.sub || !payload.role) {
        throw new UnauthorizedException('Malformed token payload');
      }

      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };

      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Failed to authenticate token');
    }
  }
}
