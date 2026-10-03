import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './common/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ColdProof API • Cold Chain Evidence Platform')
    .setDescription(
      'APEX • GenD Arena 2026 • Technical Validation Specification v3.2.\n\n' +
      'Evidence workflow for pharma cold chain:\n' +
      '- Ingestion & adapters (Zenodo, Mendeley, Vendor-inspired formats)\n' +
      '- Canonical normalization with immutable provenance\n' +
      '- Batch-centric timeline & segment mapping (CP-DEMO-001)\n' +
      '- Exception engine (DEMO_2_8C product profile)\n' +
      '- QA human-in-the-loop review actions\n' +
      '- Evidence package reports with SHA-256 integrity hash\n' +
      '- Immutable audit trail'
    )
    .setVersion('3.2.0')
    .addTag('sources', 'Source asset registry and immutable provenance metadata')
    .addTag('imports', 'Ingestion orchestration and parser outcome summaries')
    .addTag('scenarios', 'Scenario manifests (S01-S06) and scenario builder')
    .addTag('batches', 'Batch-centric evidence view, canonical streams, and exceptions')
    .addTag('exceptions', 'Threshold excursions, missing evidence, and QA review')
    .addTag('qa-reviews', 'QA human-in-the-loop review records')
    .addTag('reports', 'Verifiable evidence package reports and integrity hashes')
    .addTag('audit', 'Immutable append-only audit trail')
    .addTag('users', 'User directory and RBAC assignments')
    .addTag('auth', 'Demo authentication and role management')
    .addTag('health', 'System health check and database connectivity')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // Serve Swagger UI at both /docs and /api/docs
  SwaggerModule.setup('docs', app, document);
  SwaggerModule.setup('api/docs', app, document);

  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`ColdProof API running on http://localhost:${port}/api`);
  console.log(`Swagger documentation available at http://localhost:${port}/docs and http://localhost:${port}/api/docs`);
}

void bootstrap();

