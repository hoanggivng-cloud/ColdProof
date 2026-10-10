import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../common/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockUsers = [
    { id: '1', email: 'admin@coldproof.local', role: 'ADMIN', created_at: new Date() },
    { id: '2', email: 'operator@coldproof.local', role: 'OPERATOR', created_at: new Date() },
    { id: '3', email: 'qa@coldproof.local', role: 'QA_REVIEWER', created_at: new Date() },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findMany: jest.fn().mockResolvedValue(mockUsers),
              findUnique: jest.fn().mockImplementation(({ where }) => {
                const user = mockUsers.find(u => u.id === where.id);
                return Promise.resolve(user || null);
              }),
            },
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('status', () => {
    it('should return service status', () => {
      expect(service.status()).toEqual({
        module: 'users',
        status: 'READY',
        message: 'User registry active with role-based definitions.',
      });
    });
  });

  describe('findAll', () => {
    it('should return all users ordered by created_at', async () => {
      const result = await service.findAll();
      expect(result).toEqual(mockUsers);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          email: true,
          role: true,
          active: true,
          created_at: true,
        },
        orderBy: { created_at: 'asc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      const result = await service.findOne('1');
      expect(result).toEqual(mockUsers[0]);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        select: {
          id: true,
          email: true,
          role: true,
          active: true,
          created_at: true,
        },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: '999' },
        select: {
          id: true,
          email: true,
          role: true,
          active: true,
          created_at: true,
        },
      });
    });
  });
});
