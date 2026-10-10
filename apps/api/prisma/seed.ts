import { PrismaClient, MeasurementOrigin, BusinessContextOrigin, ImportStatus } from '@prisma/client';

import * as crypto from 'crypto';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

const prisma = new PrismaClient();

async function main() {
  console.log('--- Seeding ColdProof Database ---');

  const defaultPasswordHash = hashPassword('123456');

  // 1. Users
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@gmail.com' },
    update: { role: 'ADMIN', password_hash: defaultPasswordHash },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@gmail.com',
      role: 'ADMIN',
      password_hash: defaultPasswordHash,
    },
  });

  const operatorUser = await prisma.user.upsert({
    where: { email: 'operator@gmail.com' },
    update: { role: 'OPERATOR', password_hash: defaultPasswordHash },
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'operator@gmail.com',
      role: 'OPERATOR',
      password_hash: defaultPasswordHash,
    },
  });

  const qaUser = await prisma.user.upsert({
    where: { email: 'qa@gmail.com' },
    update: { role: 'QA_REVIEWER', password_hash: defaultPasswordHash },
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      email: 'qa@gmail.com',
      role: 'QA_REVIEWER',
      password_hash: defaultPasswordHash,
    },
  });

  // Clean up any legacy viewer users if they exist
  await prisma.user.deleteMany({
    where: { role: { notIn: ['ADMIN', 'OPERATOR', 'QA_REVIEWER'] } },
  });

  console.log(`Created/verified users: ${adminUser.email}, ${operatorUser.email}, ${qaUser.email}`);

  // 2. Source Assets (Zenodo & Mendeley)
  // Note: source_assets has immutability trigger on UPDATE/DELETE, so check existence first.
  let zenodoSource = await prisma.sourceAsset.findUnique({
    where: {
      dataset_file_name_version: {
        dataset: 'Zenodo - Cold Storage Room Monitoring (2025)',
        file_name: 'SENSOR06_raw.csv',
        version: 'v1.0',
      },
    },
  });

  if (!zenodoSource) {
    zenodoSource = await prisma.sourceAsset.create({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        dataset: 'Zenodo - Cold Storage Room Monitoring (2025)',
        file_name: 'SENSOR06_raw.csv',
        checksum_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        version: 'v1.0',
        origin: MeasurementOrigin.REAL_PUBLIC_DATA,
        uri: 'https://doi.org/10.5281/zenodo.15130001',
        license_ref: 'CC-BY-4.0',
      },
    });
    console.log('Created Zenodo source asset');
  }

  let mendeleySource = await prisma.sourceAsset.findUnique({
    where: {
      dataset_file_name_version: {
        dataset: 'Mendeley - Average temperature in an insulated box (sz5dgkz7k8)',
        file_name: 'C07_condition_snapshot.xlsx',
        version: 'v1.0',
      },
    },
  });

  if (!mendeleySource) {
    mendeleySource = await prisma.sourceAsset.create({
      data: {
        id: '22222222-2222-4222-8222-222222222222',
        dataset: 'Mendeley - Average temperature in an insulated box (sz5dgkz7k8)',
        file_name: 'C07_condition_snapshot.xlsx',
        checksum_sha256: 'c5b164c4897f26d21e8e818816c72e27d825ae72fb8b0d8ce20df01e847775a6',
        version: 'v1.0',
        origin: MeasurementOrigin.REAL_PUBLIC_DATA,
        uri: 'https://doi.org/10.17632/sz5dgkz7k8.1',
        license_ref: 'CC-BY-4.0',
      },
    });
    console.log('Created Mendeley source asset');
  }

  // 3. Import Jobs
  const importJobId = '33333333-3333-4333-8333-333333333333';
  const existingImport = await prisma.importJob.findUnique({ where: { id: importJobId } });
  if (!existingImport) {
    await prisma.importJob.create({
      data: {
        id: importJobId,
        source_id: zenodoSource.id,
        parser_id: 'zenodo-timeseries-adapter',
        parser_version: '1.0.0',
        status: ImportStatus.COMPLETE,
        parsed_count: 1440,
        rejected_count: 0,
        warning_count: 0,
        completed_at: new Date('2026-10-01T08:00:15.000Z'),
      },
    });
    console.log('Created import job for Zenodo');
  }

  // 4. Scenarios S01–S06
  const scenariosData = [
    {
      id: 'S01',
      version: 1,
      name: 'Normal multi-leg chain',
      manifest: {
        scenario_id: 'S01',
        version: 1,
        name: 'Normal multi-leg chain',
        product_profile: { id: 'DEMO_2_8C', lower_threshold: 2.0, upper_threshold: 8.0 },
        segments: [
          { id: 'LEG-01', source: 'zenodo/SENSOR06', selector: 'stable_window_A', business_context_origin: 'SYNTHETIC' },
          { id: 'LEG-02', source: 'zenodo/SENSOR07', selector: 'stable_window_B', handover_id: 'HANDOVER-01', business_context_origin: 'SYNTHETIC' },
        ],
        expected: { exception_count: 0, missing_issue_count: 0 },
        constraints: { cross_source_duration: false },
      },
    },
    {
      id: 'S02',
      version: 1,
      name: 'Handover heat excursion',
      manifest: {
        scenario_id: 'S02',
        version: 1,
        name: 'Handover heat excursion',
        product_profile: { id: 'DEMO_2_8C', lower_threshold: 2.0, upper_threshold: 8.0 },
        segments: [
          { id: 'LEG-01', source: 'zenodo/SENSOR06', selector: 'stable_window_A', business_context_origin: 'SYNTHETIC' },
          { id: 'LEG-02', source: 'zenodo/event_aligned_window', selector: 'door_open_hot_window', handover_id: 'HANDOVER-01', business_context_origin: 'SYNTHETIC' },
          { id: 'LEG-03', source: 'zenodo/SENSOR06', selector: 'stable_window_B', handover_id: 'HANDOVER-02', business_context_origin: 'SYNTHETIC' },
        ],
        expected: { exception_count: 1, missing_issue_count: 0 },
        constraints: { cross_source_duration: false },
      },
    },
    {
      id: 'S03',
      version: 1,
      name: 'Missing evidence gap detection',
      manifest: {
        scenario_id: 'S03',
        version: 1,
        name: 'Missing evidence gap detection',
        product_profile: { id: 'DEMO_2_8C', lower_threshold: 2.0, upper_threshold: 8.0 },
        segments: [
          { id: 'LEG-01', source: 'zenodo/SENSOR03', selector: 'gap_window', business_context_origin: 'SYNTHETIC' },
        ],
        expected: { exception_count: 0, missing_issue_count: 1 },
        constraints: { cross_source_duration: false },
      },
    },
    {
      id: 'S04',
      version: 1,
      name: 'Sensor conflict preservation',
      manifest: {
        scenario_id: 'S04',
        version: 1,
        name: 'Sensor conflict preservation',
        product_profile: { id: 'DEMO_2_8C', lower_threshold: 2.0, upper_threshold: 8.0 },
        segments: [
          { id: 'LEG-01-A', source: 'zenodo/SENSOR01', selector: 'divergent_window', business_context_origin: 'SYNTHETIC' },
          { id: 'LEG-01-B', source: 'zenodo/SENSOR02', selector: 'divergent_window', business_context_origin: 'SYNTHETIC' },
        ],
        expected: { exception_count: 0, missing_issue_count: 0, conflict_issue_count: 1 },
        constraints: { cross_source_duration: false },
      },
    },
    {
      id: 'S05',
      version: 1,
      name: 'Vendor-format heterogeneity',
      manifest: {
        scenario_id: 'S05',
        version: 1,
        name: 'Vendor-format heterogeneity',
        product_profile: { id: 'DEMO_2_8C', lower_threshold: 2.0, upper_threshold: 8.0 },
        segments: [
          { id: 'LEG-01', source: 'fixtures/vendor_inspired/format-a', selector: 'window_01', business_context_origin: 'SYNTHETIC' },
        ],
        expected: { exception_count: 0, missing_issue_count: 0 },
        constraints: { cross_source_duration: false },
      },
    },
    {
      id: 'S06',
      version: 1,
      name: 'Pre-existing bad condition snapshot',
      manifest: {
        scenario_id: 'S06',
        version: 1,
        name: 'Pre-existing bad condition snapshot',
        product_profile: { id: 'DEMO_2_8C', lower_threshold: 2.0, upper_threshold: 8.0 },
        segments: [
          { id: 'LEG-ENTRY', source: 'mendeley/conditions/C07', selector: 'initial_condition', business_context_origin: 'SYNTHETIC' },
        ],
        expected: { exception_count: 1, missing_issue_count: 0 },
        constraints: { cross_source_duration: false },
      },
    },
  ];

  for (const s of scenariosData) {
    await prisma.scenario.upsert({
      where: { id: s.id },
      update: { version: s.version, name: s.name, manifest: s.manifest },
      create: s,
    });
  }
  console.log('Created/updated scenarios S01-S06');

  // 5. Batch CP-DEMO-001
  const batch = await prisma.batch.upsert({
    where: { id: 'CP-DEMO-001' },
    update: {
      scenario_id: 'S02',
      business_context_origin: BusinessContextOrigin.SYNTHETIC,
      profile_id: 'DEMO_2_8C',
      lower_threshold: 2.0,
      upper_threshold: 8.0,
    },
    create: {
      id: 'CP-DEMO-001',
      scenario_id: 'S02',
      business_context_origin: BusinessContextOrigin.SYNTHETIC,
      profile_id: 'DEMO_2_8C',
      lower_threshold: 2.0,
      upper_threshold: 8.0,
    },
  });
  console.log(`Created/updated batch: ${batch.id}`);

  // 6. Segments for CP-DEMO-001
  const segmentsData = [
    {
      id: 'LEG-01',
      batch_id: 'CP-DEMO-001',
      source_id: zenodoSource.id,
      selector: 'stable_window_A',
      handover_id: null,
      business_context_origin: BusinessContextOrigin.SYNTHETIC,
    },
    {
      id: 'LEG-02',
      batch_id: 'CP-DEMO-001',
      source_id: zenodoSource.id,
      selector: 'door_open_hot_window',
      handover_id: 'HANDOVER-01',
      business_context_origin: BusinessContextOrigin.SYNTHETIC,
    },
    {
      id: 'LEG-03',
      batch_id: 'CP-DEMO-001',
      source_id: zenodoSource.id,
      selector: 'stable_window_B',
      handover_id: 'HANDOVER-02',
      business_context_origin: BusinessContextOrigin.SYNTHETIC,
    },
  ];

  for (const seg of segmentsData) {
    await prisma.segment.upsert({
      where: { id: seg.id },
      update: seg,
      create: seg,
    });
  }
  console.log('Created segments LEG-01, LEG-02, LEG-03');

  // 7. Canonical Measurements for CP-DEMO-001
  const baseTime = new Date('2026-10-01T08:00:00.000Z').getTime();
  const sampleMeasurements = [
    // LEG-01: Stable (4.5C to 5.2C)
    { id: 'M-01', leg: 'LEG-01', tMin: 0, temp: 4.8, hum: 45.2, exc: false },
    { id: 'M-02', leg: 'LEG-01', tMin: 15, temp: 4.9, hum: 45.0, exc: false },
    { id: 'M-03', leg: 'LEG-01', tMin: 30, temp: 5.1, hum: 45.5, exc: false },
    { id: 'M-04', leg: 'LEG-01', tMin: 45, temp: 5.0, hum: 45.3, exc: false },
    // LEG-02: Excursion during handover (rises above 8.0C up to 9.2C)
    { id: 'M-05', leg: 'LEG-02', tMin: 60, temp: 5.8, hum: 46.0, exc: false },
    { id: 'M-06', leg: 'LEG-02', tMin: 75, temp: 7.9, hum: 48.2, exc: false },
    { id: 'M-07', leg: 'LEG-02', tMin: 90, temp: 8.7, hum: 52.1, exc: true },
    { id: 'M-08', leg: 'LEG-02', tMin: 105, temp: 9.2, hum: 55.0, exc: true },
    { id: 'M-09', leg: 'LEG-02', tMin: 120, temp: 8.5, hum: 51.3, exc: true },
    { id: 'M-10', leg: 'LEG-02', tMin: 135, temp: 7.4, hum: 48.0, exc: false },
    // LEG-03: Cold chain restored (4.8C to 5.0C)
    { id: 'M-11', leg: 'LEG-03', tMin: 150, temp: 5.5, hum: 46.5, exc: false },
    { id: 'M-12', leg: 'LEG-03', tMin: 165, temp: 4.9, hum: 45.8, exc: false },
    { id: 'M-13', leg: 'LEG-03', tMin: 180, temp: 4.8, hum: 45.2, exc: false },
  ];

  const exceptionId = 'e1111111-1111-1111-1111-111111111111';

  for (const m of sampleMeasurements) {
    const timestamp = new Date(baseTime + m.tMin * 60 * 1000);
    await prisma.measurement.upsert({
      where: { record_id: m.id },
      update: {
        timestamp,
        temperature_c: m.temp,
        humidity_pct: m.hum,
        excursion_flag: m.exc,
        exception_id: m.exc ? exceptionId : null,
      },
      create: {
        record_id: m.id,
        scenario_id: 'S02',
        batch_id: 'CP-DEMO-001',
        segment_id: m.leg,
        timestamp,
        temperature_c: m.temp,
        humidity_pct: m.hum,
        source_dataset: 'Zenodo - Cold Storage Room Monitoring (2025)',
        source_file: 'SENSOR06_raw.csv',
        source_sensor_id: 'SENSOR06',
        source_row_or_ref: `row_${m.id}`,
        source_format: 'FORMAT-A',
        source_checksum_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        parser_id: 'zenodo-timeseries-adapter',
        parser_version: '1.0.0',
        measurement_origin: MeasurementOrigin.REAL_PUBLIC_DATA,
        business_context_origin: BusinessContextOrigin.SYNTHETIC,
        missing_flag: false,
        duplicate_flag: false,
        conflict_flag: false,
        profile_id: 'DEMO_2_8C',
        lower_threshold: 2.0,
        upper_threshold: 8.0,
        excursion_flag: m.exc,
        exception_id: m.exc ? exceptionId : null,
        review_status: m.exc ? 'PENDING' : undefined,
      },
    });
  }
  console.log(`Created ${sampleMeasurements.length} canonical measurements`);

  // 8. Exception for Excursion
  const excursionRecordIds = ['M-07', 'M-08', 'M-09'];
  await prisma.exception.upsert({
    where: { id: exceptionId },
    update: {
      status: 'PENDING_REVIEW',
      record_ids: excursionRecordIds,
    },
    create: {
      id: exceptionId,
      batch_id: 'CP-DEMO-001',
      record_ids: excursionRecordIds,
      profile_id: 'DEMO_2_8C',
      status: 'PENDING_REVIEW',
    },
  });
  console.log(`Created exception record: ${exceptionId}`);

  // 9. Quality Issue (Missing interval demonstration)
  const qualityIssueId = '99999999-9999-9999-9999-999999999991';
  await prisma.qualityIssue.upsert({
    where: { id: qualityIssueId },
    update: {},
    create: {
      id: qualityIssueId,
      record_ids: ['M-05', 'M-06'],
      code: 'MISSING_INTERVAL',
      detail: 'Gap of 15 minutes detected in expected 60s sampling interval; no interpolation applied per NFR-001.',
    },
  });
  console.log(`Created quality issue: ${qualityIssueId}`);

  // 10. QA Review record
  const reviewId = '88888888-8888-8888-8888-888888888881';
  await prisma.review.upsert({
    where: { id: reviewId },
    update: {
      status: 'REVIEWED',
      notes: 'Handover door opening event caused +1.2C excursion peaking at 9.2C. Quarantine batch for stability review.',
    },
    create: {
      id: reviewId,
      exception_id: exceptionId,
      reviewer_id: qaUser.id,
      status: 'REVIEWED',
      notes: 'Handover door opening event caused +1.2C excursion peaking at 9.2C. Quarantine batch for stability review.',
    },
  });
  console.log(`Created QA review record: ${reviewId}`);

  // 11. Evidence Report
  const reportId = '77777777-7777-7777-7777-777777777771';
  const report = await prisma.report.upsert({
    where: { id: reportId },
    update: {},
    create: {
      id: reportId,
      batch_id: 'CP-DEMO-001',
      version: 1,
      uri: '/api/reports/77777777-7777-7777-7777-777777777771/download',
      checksum_sha256: 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3000000000000000000000000',
      provenance: {
        report_id: 'RPT-CP-DEMO-001-v1',
        report_version: 1,
        generated_at: new Date().toISOString(),
        generated_by: 'qa@gmail.com',
        batch_id: 'CP-DEMO-001',
        scenario_id: 'S02',
        product_profile: 'DEMO_2_8C',
        segments: ['LEG-01', 'LEG-02', 'LEG-03'],
        source_assets: ['DS-ZENODO-01'],
        parser_versions: ['zenodo-timeseries-adapter:1.0.0'],
        disclaimer: 'Technical validation benchmark; synthetic business context; not a legal compliance certification.',
      },
    },
  });
  console.log(`Created evidence report: ${report.id}`);

  // 12. Audit Events
  const auditEventId = '66666666-6666-6666-6666-666666666661';
  await prisma.auditEvent.upsert({
    where: { id: auditEventId },
    update: {},
    create: {
      id: auditEventId,
      actor_id: operatorUser.id,
      action: 'IMPORT_COMPLETED',
      entity_type: 'source_assets',
      entity_id: zenodoSource.id,
      payload: {
        file_name: 'SENSOR06_raw.csv',
        parsed_count: 1440,
        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
    },
  });
  console.log(`Created audit event: ${auditEventId}`);

  console.log('--- Seeding Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
