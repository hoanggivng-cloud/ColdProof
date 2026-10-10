import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/common/configure-app';

describe('ColdProof End-to-End System Integration Workflow', () => {
  let app: INestApplication;
  const testEmail = `qa.e2e.${Date.now()}@coldproof.local`;
  const testPassword = 'SecurePassword123';
  let qaToken = '';
  let operatorToken = '';
  const testBatchId = `CP-E2E-${Date.now().toString().slice(-4)}`;
  const exceptionId = 'e1111111-1111-1111-1111-111111111111';
  const reportId = '77777777-7777-7777-7777-777777777771';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('Step 1: Register new QA Reviewer user via POST /api/auth/register', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        role: 'QA_REVIEWER',
      })
      .expect(201);

    expect(res.body).toHaveProperty('access_token');
    expect(res.body.user).toMatchObject({
      email: testEmail,
      role: 'QA_REVIEWER',
    });
    qaToken = res.body.access_token as string;
  });

  it('Step 2: Login operator and verify invalid login is rejected', async () => {
    // 2.1 Rejection
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nonexistent@coldproof.local', password: 'wrong' })
      .expect(401);

    // 2.2 Login with seeded operator
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'operator@coldproof.local' })
      .expect(201);

    expect(res.body).toHaveProperty('access_token');
    operatorToken = res.body.access_token as string;
  });

  it('Step 3: Create a new batch via POST /api/batches', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/batches')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        id: testBatchId,
        scenario_id: 'S02',
        profile_id: 'DEMO_2_8C',
        lower_threshold: 2.0,
        upper_threshold: 8.0,
        device_ids: ['DEV-DEMO-01'],
      })
      .expect(201);

    expect(res.body.id).toBe(testBatchId);
    expect(res.body.profile_id).toBe('DEMO_2_8C');
  });

  it('Step 4: Query batches list and batch detail with canonical stream', async () => {
    const listRes = await request(app.getHttpServer()).get('/api/batches').expect(200);
    const found = (listRes.body as Array<{ id: string }>).find(b => b.id === testBatchId);
    expect(found).toBeDefined();

    const measRes = await request(app.getHttpServer())
      .get('/api/batches/CP-DEMO-001/measurements')
      .expect(200);
    expect(Array.isArray(measRes.body)).toBe(true);
    expect(measRes.body.length).toBeGreaterThan(0);
  });

  it('Step 5: Enforce RBAC - Operator review is forbidden (403)', async () => {
    await request(app.getHttpServer())
      .post(`/api/exceptions/${exceptionId}/review`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ status: 'REVIEWED', notes: 'Operator cannot review' })
      .expect(403);
  });

  it('Step 6: QA Reviewer reviews exception and records CAPA corrective action', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/exceptions/${exceptionId}/review`)
      .set('Authorization', `Bearer ${qaToken}`)
      .send({
        status: 'REVIEWED',
        notes: 'Excursion of 9.2C verified within MKT tolerance. CAPA documented.',
        corrective_action: 'Deploy thermal reflective tarp during transit.',
      })
      .expect(201);

    expect(res.body.status).toBe('REVIEWED');
  });

  it('Step 7: Download compliant PDF evidence report package', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/reports/${reportId}/pdf`)
      .expect(200)
      .expect('Content-Type', /application\/pdf/);

    expect(res.header['content-disposition']).toContain('attachment');
  });

  it('Step 8: Verify immutable audit log contains full event sequence', async () => {
    const res = await request(app.getHttpServer()).get('/api/audit').expect(200);
    const actions = (res.body as Array<{ action: string }>).map(a => a.action);
    expect(actions).toContain('USER_REGISTERED');
    expect(actions).toContain('BATCH_CREATED');
    expect(actions).toContain('QA_REVIEW_ACTION');
  });
});
