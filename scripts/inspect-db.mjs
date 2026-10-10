import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');

if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // fallback if already loaded
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('       COLDPROOF DATABASE INSPECTION SNAPSHOT        ');
  console.log('======================================================\n');

  let prisma;
  try {
    const clientPath = path.join(rootDir, 'apps/api/node_modules/@prisma/client/default.js');
    const prismaPkg = await import(`file://${clientPath.replaceAll('\\', '/')}`);
    const PrismaClient = prismaPkg.PrismaClient || prismaPkg.default.PrismaClient;
    prisma = new PrismaClient();
  } catch (err) {
    console.error('❌ Không thể khởi tạo PrismaClient:', err.message);
    process.exit(1);
  }

  try {
    // 1. Table Counts
    const [
      usersCount,
      batchesCount,
      segmentsCount,
      measurementsCount,
      exceptionsCount,
      reviewsCount,
      reportsCount,
      auditCount,
      qualityIssuesCount,
      scenariosCount,
      sourceAssetsCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.batch.count(),
      prisma.segment.count(),
      prisma.measurement.count(),
      prisma.exception.count(),
      prisma.review.count(),
      prisma.report.count(),
      prisma.auditEvent.count(),
      prisma.qualityIssue.count(),
      prisma.scenario.count(),
      prisma.sourceAsset.count(),
    ]);

    console.log('📊 TỔNG QUAN CÁC BẢNG (TABLE ROW COUNTS):');
    console.table([
      { 'Model / Table': 'User (users)', 'Row Count': usersCount, 'Ý nghĩa nghiệp vụ': 'Tài khoản người dùng & phân quyền' },
      { 'Model / Table': 'Batch (batches)', 'Row Count': batchesCount, 'Ý nghĩa nghiệp vụ': 'Hồ sơ lô hàng đang theo dõi' },
      { 'Model / Table': 'Segment (segments)', 'Row Count': segmentsCount, 'Ý nghĩa nghiệp vụ': 'Chặng hành trình vận chuyển' },
      { 'Model / Table': 'Measurement (measurements)', 'Row Count': measurementsCount, 'Ý nghĩa nghiệp vụ': 'Chuỗi số đo nhiệt độ canonical' },
      { 'Model / Table': 'Exception (exceptions)', 'Row Count': exceptionsCount, 'Ý nghĩa nghiệp vụ': 'Sự cố phơi nhiệt / cảnh báo' },
      { 'Model / Table': 'Review (reviews)', 'Row Count': reviewsCount, 'Ý nghĩa nghiệp vụ': 'Đánh giá QA & biện pháp CAPA' },
      { 'Model / Table': 'Report (reports)', 'Row Count': reportsCount, 'Ý nghĩa nghiệp vụ': 'Báo cáo bằng chứng tuân thủ PDF/JSON' },
      { 'Model / Table': 'AuditEvent (audit_events)', 'Row Count': auditCount, 'Ý nghĩa nghiệp vụ': 'Nhật ký kiểm toán bất biến (21 CFR)' },
      { 'Model / Table': 'QualityIssue (quality_issues)', 'Row Count': qualityIssuesCount, 'Ý nghĩa nghiệp vụ': 'Vấn đề chất lượng dữ liệu / gaps' },
      { 'Model / Table': 'Scenario (scenarios)', 'Row Count': scenariosCount, 'Ý nghĩa nghiệp vụ': 'Kịch bản thử nghiệm chuẩn (S01-S06)' },
      { 'Model / Table': 'SourceAsset (source_assets)', 'Row Count': sourceAssetsCount, 'Ý nghĩa nghiệp vụ': 'Nguồn dữ liệu gốc (Zenodo / Mendeley)' },
    ]);

    // 2. Sample Users
    const users = await prisma.user.findMany({
      orderBy: { created_at: 'desc' },
      take: 5,
    });
    console.log('\n👤 TÀI KHOẢN NGƯỜI DÙNG GẦN ĐÂY (USERS):');
    console.table(
      users.map(u => ({
        ID: u.id.slice(0, 8) + '...',
        Email: u.email,
        Role: u.role,
        Created: u.created_at.toISOString().replace('T', ' ').slice(0, 19),
      }))
    );

    // 3. Batches Detail
    const batches = await prisma.batch.findMany({
      orderBy: { created_at: 'desc' },
      take: 6,
    });
    console.log('\n📦 DANH SÁCH LÔ HÀNG (BATCHES):');
    console.table(
      batches.map(b => ({
        'Batch ID': b.id,
        Scenario: b.scenario_id ?? '—',
        Profile: b.profile_id ?? '—',
        'Dải nhiệt': `${b.lower_threshold ?? 2}°C – ${b.upper_threshold ?? 8}°C`,
        Origin: b.business_context_origin,
        Created: b.created_at.toISOString().replace('T', ' ').slice(0, 19),
      }))
    );

    // 4. Measurements Stats
    if (measurementsCount > 0) {
      const stats = await prisma.measurement.aggregate({
        _min: { temperature_c: true },
        _max: { temperature_c: true },
        _avg: { temperature_c: true },
      });
      const excursions = await prisma.measurement.count({
        where: { excursion_flag: true },
      });
      console.log('\n🌡️ THỐNG KÊ SỐ ĐO NHIỆT ĐỘ (CANONICAL STREAM STATS):');
      console.log(`  - Nhiệt độ thấp nhất (Min): ${stats._min.temperature_c ?? '—'}°C`);
      console.log(`  - Nhiệt độ cao nhất (Max):  ${stats._max.temperature_c ?? '—'}°C`);
      console.log(`  - Nhiệt độ trung bình (Avg): ${stats._avg.temperature_c ? stats._avg.temperature_c.toFixed(2) : '—'}°C`);
      console.log(`  - Số lượng mẫu vượt ngưỡng: ${excursions} / ${measurementsCount} điểm đo`);
    }

    // 5. Recent Audit Events
    const recentAudits = await prisma.auditEvent.findMany({
      orderBy: { created_at: 'desc' },
      take: 5,
    });
    console.log('\n🛡️ 5 SỰ KIỆN KIỂM TOÁN GẦN ĐÂY (AUDIT TRAIL):');
    console.table(
      recentAudits.map(a => ({
        Action: a.action,
        Entity: a.entity_type,
        EntityID: a.entity_id ? a.entity_id.slice(0, 12) + '...' : '—',
        Actor: a.actor_id ? a.actor_id.slice(0, 8) + '...' : 'SYSTEM',
        Timestamp: a.created_at.toISOString().replace('T', ' ').slice(0, 19),
      }))
    );

    console.log('\n✅ Kiểm tra hoàn tất thành công.\n');
  } catch (err) {
    console.error('❌ Lỗi khi truy vấn cơ sở dữ liệu:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
