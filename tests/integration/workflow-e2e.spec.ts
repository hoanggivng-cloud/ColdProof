import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/common/configure-app';
import { PrismaService } from '../../apps/api/src/common/prisma.service';
import { canonicalJson } from '../../apps/api/src/common/canonical-json';
import { createHash } from 'crypto';
describe('new synthetic batch → analysis → QA → evidence → admin', () => {
  let app: INestApplication, prisma: PrismaService;
  let operator: string, qa: string, admin: string;
  const id = `DEMO-${randomUUID()}`;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init(); prisma = app.get(PrismaService);
    const login = async (email: string) => (await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: '123456' }).expect(201)).body.access_token as string;
    operator = await login('operator@gmail.com'); qa = await login('qa@gmail.com'); admin = await login('admin@gmail.com');
  }, 30000);
  afterAll(async () => { if (app) await app.close(); });
  it('runs a fresh multi-device shipment and exports its actual reviewed evidence', async () => {
    await request(app.getHttpServer()).post('/api/batches').send({ id }).expect(401);
    await request(app.getHttpServer()).post('/api/batches').set('Authorization', `Bearer ${qa}`).send({ id }).expect(403);
    await request(app.getHttpServer()).post('/api/batches').set('Authorization', `Bearer ${operator}`).send({ id, profile_id: 'DEMO_2_8C', lower_threshold: 2, upper_threshold: 8, device_ids: ['A','B'], context: { product: 'Demo Product', start: '2026-10-10T01:00:00Z', end: '2026-10-10T02:00:00Z' } }).expect(201);
    await request(app.getHttpServer()).post(`/api/batches/${id}/handover`).set('Authorization', `Bearer ${operator}`).send({ id, context: { location: 'Demo dock', timestampUtc: '2026-10-10T02:00:00Z' } }).expect(201);
    const sim = await request(app.getHttpServer()).post(`/api/batches/${id}/simulate`).set('Authorization', `Bearer ${operator}`).send({ scenario: 'EXCURSION', seed: 42 }).expect(201);
    expect(sim.body.exceptions).toBe(2);
    await request(app.getHttpServer()).post(`/api/batches/${id}/simulate`).set('Authorization', `Bearer ${operator}`).send({ scenario: 'EXCURSION', seed: 42 }).expect(409);
    const original = await prisma.measurement.findMany({ where: { batch_id: id }, orderBy: { record_id: 'asc' } });
    expect(original.every(m => m.measurement_origin === 'SYNTHETIC')).toBe(true);
    const exceptions = await prisma.exception.findMany({ where: { batch_id: id } });
    for (const e of exceptions) {
      await request(app.getHttpServer()).post(`/api/exceptions/${e.id}/review`).set('Authorization', `Bearer ${operator}`).send({ action: 'ACKNOWLEDGE', notes: 'forbidden' }).expect(403);
      await request(app.getHttpServer()).post(`/api/exceptions/${e.id}/review`).set('Authorization', `Bearer ${qa}`).send({ action: 'ACKNOWLEDGE', notes: 'Observed synthetic breach; evidence checked.' }).expect(201);
    }
    expect(await prisma.measurement.findMany({ where: { batch_id: id }, orderBy: { record_id: 'asc' } })).toEqual(original);
    const report = await request(app.getHttpServer()).post(`/api/batches/${id}/reports`).set('Authorization', `Bearer ${qa}`).expect(201);
    expect(report.body.provenance.reviews).toHaveLength(2);
    expect(report.body.provenance.shipment_context.handover.location).toBe('Demo dock');
    expect(report.body.provenance.quality_issues).toHaveLength(0);
    expect(report.body.provenance.measurements.every((m: { batch_id: string }) => m.batch_id === id)).toBe(true);
    expect(createHash('sha256').update(canonicalJson(report.body.provenance)).digest('hex')).toBe(report.body.checksum_sha256);
    const pdf = await request(app.getHttpServer()).get(`/api/reports/${report.body.id}/pdf`).set('Authorization', `Bearer ${qa}`).expect(200).expect('Content-Type', /application\/pdf/);
    expect(Buffer.isBuffer(pdf.body)).toBe(true); expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    await request(app.getHttpServer()).get('/api/users').set('Authorization', `Bearer ${operator}`).expect(403);
    await request(app.getHttpServer()).get('/api/users').set('Authorization', `Bearer ${admin}`).expect(200);
  });
  it('normal scenario produces no review tasks; missing evidence stays scoped to its batch', async () => {
    for (const scenario of ['NORMAL','MISSING']) {
      const batchId = `${id}-${scenario}`;
      await request(app.getHttpServer()).post('/api/batches').set('Authorization', `Bearer ${operator}`).send({ id: batchId, device_ids: ['A'], context: { start: '2026-10-10T01:00:00Z', end: '2026-10-10T02:00:00Z' } }).expect(201);
      const result = await request(app.getHttpServer()).post(`/api/batches/${batchId}/simulate`).set('Authorization', `Bearer ${operator}`).send({ scenario }).expect(201);
      expect(result.body.exceptions).toBe(0);
      const issues = await request(app.getHttpServer()).get(`/api/batches/${batchId}/exceptions`).set('Authorization', `Bearer ${qa}`).expect(200);
      expect(issues.body.quality_issues.length).toBe(scenario === 'MISSING' ? 1 : 0);
    }
  });
  it('admin assigns role and locks access; public registration cannot self-promote', async () => {
    const registered = await request(app.getHttpServer()).post('/api/auth/register').send({ email: `${randomUUID()}@demo.test`, password: 'test-password', role: 'QA_REVIEWER' }).expect(201);
    expect(registered.body.user.role).toBe('OPERATOR');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: registered.body.user.email } });
    await request(app.getHttpServer()).patch(`/api/users/${user.id}`).set('Authorization', `Bearer ${operator}`).send({ role: 'ADMIN' }).expect(403);
    await request(app.getHttpServer()).patch(`/api/users/${user.id}`).set('Authorization', `Bearer ${admin}`).send({ role: 'QA_REVIEWER' }).expect(200);
    await request(app.getHttpServer()).patch(`/api/users/${user.id}`).set('Authorization', `Bearer ${admin}`).send({ active: false }).expect(200);
    await request(app.getHttpServer()).get('/api/batches').set('Authorization', `Bearer ${registered.body.access_token}`).expect(401);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: user.email, password: 'test-password' }).expect(401);
  });
});
