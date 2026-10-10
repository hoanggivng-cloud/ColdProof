import { hashPassword } from './password.util';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let _prisma: PrismaService;

  const mockUser = {
    id: '1',
    email: 'operator@coldproof.local',
    role: 'OPERATOR',
    active: true,
    password_hash: hashPassword('password'),
    created_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn().mockImplementation(({ where }) => {
                if (where.email === mockUser.email || where.id === mockUser.id) {
                  return Promise.resolve(mockUser);
                }
                return Promise.resolve(null);
              }),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    _prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('status', () => {
    it('should return service status', () => {
      expect(service.status()).toEqual({
        module: 'auth',
        status: 'READY',
        message: 'Authentication and RBAC active for Operator, QA Reviewer, and Admin.',
      });
    });
  });

  describe('login', () => {
    it('should return token and user details for valid email', async () => {
      const result = await service.login({ email: 'operator@coldproof.local', password: 'password' });
      expect(result).toHaveProperty('access_token');
      expect(result.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });

      // Verify token payload (just simple check)
      const payloadPart = result.access_token.split('.')[1];
      const decodedPayload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf-8'));
      expect(decodedPayload.sub).toBe(mockUser.id);
      expect(decodedPayload.email).toBe(mockUser.email);
      expect(decodedPayload.role).toBe(mockUser.role);
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      await expect(service.login({ email: 'unknown@local', password: 'pwd' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('me', () => {
    it('should return the user by id', async () => {
      const result = await service.me('1');
      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      await expect(service.me('999')).rejects.toThrow(UnauthorizedException);
    });
  });
});
