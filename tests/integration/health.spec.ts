import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../../apps/api/src/common/health.controller';
import { configureApp } from '../../apps/api/src/common/configure-app';
describe('API HTTP integration', () => {
  it('serves the foundation liveness contract through the /api prefix', async () => {
    const module = await Test.createTestingModule({ controllers: [HealthController] }).compile();
    const app = module.createNestApplication();
    configureApp(app);
    await app.init();
    try { await request(app.getHttpServer()).get('/api/health').expect(200).expect({ status: 'ok', scope: 'foundation', readiness: 'not-checked' }); }
    finally { await app.close(); }
  }, 30000);
});
