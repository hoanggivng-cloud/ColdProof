import 'reflect-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/common/configure-app.js';

async function exportOpenApi() {
  const app = await NestFactory.create(AppModule, { logger: false });
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
    .addBearerAuth()
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
  const docsDir = path.resolve(process.cwd(), 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  const outputPath = path.resolve(docsDir, 'openapi-mvp.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf8');

  console.log(`[openapi:generate] Successfully exported OpenAPI specification to ${outputPath}`);
  await app.close();
}

exportOpenApi().catch((err) => {
  console.error('[openapi:generate] Error exporting OpenAPI specification:', err);
  process.exit(1);
});

