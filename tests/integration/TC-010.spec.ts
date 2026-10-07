import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/common/configure-app';
import { PrismaService } from '../../apps/api/src/common/prisma.service';

// Expected interface: Role + protected route → authorized response or 401/403
describe('TC-010 • RBAC (Operator review forbidden, QA permitted)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const exceptionId = 'e1111111-1111-1111-1111-111111111111';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    // Ensure exception exists
    await prisma.exception.upsert({
      where: { id: exceptionId },
      update: {},
      create: {
        id: exceptionId,
        batch_id: 'CP-DEMO-001',
        record_ids: ['M-07', 'M-08', 'M-09'],
        profile_id: 'DEMO_2_8C',
        status: 'PENDING_REVIEW',
      },
    });
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects unauthenticated review request with 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .post(`/api/exceptions/${exceptionId}/review`)
      .send({ status: 'REVIEWED', notes: 'Unauthenticated attempt' })
      .expect(401);
  });

  it('forbids Operator (DATA_ENGINEER) from reviewing exception with 403 and logs audit event', async () => {
    // 1. Operator logs in
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'operator@coldproof.local' })
      .expect(201);

    expect(loginRes.body.user.role).toBe('DATA_ENGINEER');
    const operatorToken = loginRes.body.access_token;

    // 2. Operator attempts to review exception
    const reviewRes = await request(app.getHttpServer())
      .post(`/api/exceptions/${exceptionId}/review`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ status: 'REVIEWED', notes: 'Operator trying to approve' })
      .expect(403);

    expect(reviewRes.body.message).toContain("Role 'DATA_ENGINEER' is not authorized");

    // 3. Verify audit log was recorded for the unauthorized attempt (FR-SEC-001)
    const auditRecord = await prisma.auditEvent.findFirst({
      where: {
        action: 'UNAUTHORIZED_REVIEW_ATTEMPT',
        entity_id: exceptionId,
      },
      orderBy: { created_at: 'desc' },
    });

    expect(auditRecord).toBeDefined();
    expect((auditRecord?.payload as Record<string, unknown>)?.role).toBe('DATA_ENGINEER');
  });

  it('authorizes QA Reviewer (QA_REVIEWER) to successfully submit exception review', async () => {
    // 1. QA logs in
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'qa@coldproof.local' })
      .expect(201);

    expect(loginRes.body.user.role).toBe('QA_REVIEWER');
    const qaToken = loginRes.body.access_token;

    // 2. QA reviews exception
    const reviewRes = await request(app.getHttpServer())
      .post(`/api/exceptions/${exceptionId}/review`)
      .set('Authorization', `Bearer ${qaToken}`)
      .send({
        status: 'REVIEWED',
        notes: 'QA Reviewer approved handover excursion investigation',
        corrective_action: 'Secondary logger verified acceptable',
      })
      .expect(201);

    expect(reviewRes.body).toHaveProperty('id');
    expect(reviewRes.body.status).toBe('REVIEWED');
  });
});
