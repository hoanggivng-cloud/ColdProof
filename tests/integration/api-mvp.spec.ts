import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/common/configure-app';

describe('ColdProof MVP API Endpoints', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const login = await request(app.getHttpServer()).post("/api/auth/login").send({ email: "admin@gmail.com", password: "123456" }).expect(201);
    token = login.body.access_token;
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/sources returns registered source assets', async () => {
    const res = await request(app.getHttpServer()).get('/api/sources').expect(200).set('Authorization', `Bearer ${token}`);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('checksum_sha256');
    expect(res.body[0]).toHaveProperty('origin');
  });

  it('GET /api/scenarios returns S01-S06', async () => {
    const res = await request(app.getHttpServer()).get('/api/scenarios').expect(200).set('Authorization', `Bearer ${token}`);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = (res.body as Array<{ id: string }>).map((s) => s.id);
    expect(ids).toContain('S01');
    expect(ids).toContain('S02');
  });

  it('GET /api/batches returns demo batch CP-DEMO-001 with status and segments', async () => {
    const res = await request(app.getHttpServer()).get('/api/batches').expect(200).set('Authorization', `Bearer ${token}`);
    expect(Array.isArray(res.body)).toBe(true);
    const demoBatch = (res.body as Array<{ id: string; status: string; segments_count: number }>).find((b) => b.id === 'CP-DEMO-001');
    expect(demoBatch).toBeDefined();
    expect(demoBatch?.status).toBe('EXCEPTION');
    expect(demoBatch?.segments_count).toBe(3);
  });

  it('GET /api/batches/CP-DEMO-001/measurements returns canonical stream', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/batches/CP-DEMO-001/measurements').set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('source_dataset');
    expect(res.body[0]).toHaveProperty('source_checksum_sha256');
  });

  it('GET /api/exceptions returns detected excursions', async () => {
    const res = await request(app.getHttpServer()).get('/api/exceptions').expect(200).set('Authorization', `Bearer ${token}`);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/auth/login logs in demo user and returns token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'qa@gmail.com', password: '123456' })
      .expect(201);
    expect(res.body).toHaveProperty('access_token');
    expect(res.body.user.role).toBe('QA_REVIEWER');
  });

  it('GET /api/reports returns generated evidence package metadata', async () => {
    const res = await request(app.getHttpServer()).get('/api/reports').expect(200).set('Authorization', `Bearer ${token}`);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('provenance');
    expect(res.body[0]).toHaveProperty('checksum_sha256');
  });
});
