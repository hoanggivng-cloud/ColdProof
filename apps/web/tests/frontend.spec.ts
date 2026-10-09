import { expect, test } from '@playwright/test';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/backend/[...path]/route';

const session = (role: string) => [{ name: 'cp_token', value: 'test-token', url: 'http://localhost:3000' }, { name: 'cp_user', value: Buffer.from(JSON.stringify({ email: `${role.toLowerCase()}@coldproof.local`, role, serverRole: role })).toString('base64url'), url: 'http://localhost:3000' }];

test.beforeEach(async ({ page, context }) => {
  await context.addCookies(session('OPERATOR'));
  await page.route('**/api/backend/**', route => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/health') ? { status: 'ok', readiness: 'not-checked' } : path.endsWith('/exceptions') && path.includes('/batches/') ? { exceptions: [], quality_issues: [] } : path.endsWith('/batches') ? [{ id: 'CP-UI-TEST', status: 'EXCEPTION', segments_count: 2, created_at: '2026-10-09T01:00:00Z' }] : path.endsWith('/CP-UI-TEST') ? { id: 'CP-UI-TEST', business_context_origin: 'SYNTHETIC', segments: [], timeline: [] } : [];
    return route.fulfill({ json: body });
  });
});

test('all routes share palette and navigation links', async ({ page }) => {
  for (const path of ['/', '/batches', '/batches/new', '/batches/CP-UI-TEST', '/sources', '/imports', '/qa', '/reports', '/profiles', '/admin']) {
    await page.goto(path);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 247, 250)');
    await expect(page.locator('h1')).toHaveCSS('color', 'rgb(20, 23, 31)');
    await expect(page.locator('.topbar')).toHaveCSS('background-color', 'rgb(14, 30, 58)');
  }
  await page.getByRole('navigation', { name: 'Menu chính' }).getByRole('link', { name: 'Lô hàng', exact: true }).click();
  await page.getByRole('link', { name: 'CP-UI-TEST', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'CP-UI-TEST' })).toBeVisible();
  await expect(page.getByText('Mô phỏng', { exact: true })).toBeVisible();
});

test('screens require a session and login sends users back to the requested screen', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/batches');
  await expect(page).toHaveURL(/\/login\?next=%2Fbatches/);
  await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeFocused();
  await expect(page.getByRole('link', { name: 'Đăng ký' })).toHaveCount(0);
  await expect(page.getByText('Chưa có tài khoản? Liên hệ quản trị viên.')).toBeVisible();
  await page.goto('/register');
  await expect(page).toHaveURL(/\/login$/);
  let attempts = 0;
  await page.route('**/api/session', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    attempts += 1;
    if (attempts === 1) return route.fulfill({ status: 401, json: { message: 'Email hoặc mật khẩu không đúng' } });
    await context.addCookies(session('OPERATOR'));
    return route.fulfill({ json: { user: { email: 'operator@coldproof.local', role: 'OPERATOR', serverRole: 'DATA_ENGINEER' } } });
  });
  await page.goto('/login?next=%2Fbatches');
  await page.getByLabel('Email').fill('operator@coldproof.local');
  const password = page.getByLabel('Mật khẩu', { exact: true });
  await password.fill('secret');
  const reveal = page.getByRole('button', { name: 'Hiện mật khẩu' });
  await reveal.click();
  await expect(page.getByRole('button', { name: 'Ẩn mật khẩu' })).toHaveAttribute('aria-pressed', 'true');
  await expect(password).toHaveAttribute('type', 'text');
  await password.press('Enter');
  await expect(page.locator('.alert-error')).toHaveText('Email hoặc mật khẩu không đúng');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/batches$/);
  await expect(page.locator('.topbar')).toContainText('Operator');
  await expect(page.getByRole('navigation', { name: 'Menu chính' }).getByRole('link', { name: 'Quản trị' })).toHaveCount(0);
});

test('admin menu is shown only to the Admin role and QA cannot open the shipment form', async ({ page, context }) => {
  await context.clearCookies();
  await context.addCookies(session('QA_REVIEWER'));
  await page.goto('/batches');
  await expect(page.getByRole('link', { name: 'Tạo Shipment' })).toHaveCount(0);
  await page.goto('/batches/new');
  await expect(page.getByText('Không có quyền tạo Shipment')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tạo Shipment', exact: true })).toHaveCount(0);
  await page.goto('/batches');
  await expect(page.locator('.topbar')).toContainText('QA Reviewer');
  await expect(page.getByRole('link', { name: 'Quản trị' })).toHaveCount(0);
  await context.clearCookies();
  await context.addCookies(session('ADMIN'));
  await page.goto('/batches');
  await expect(page.getByRole('navigation', { name: 'Menu chính' }).getByRole('link', { name: 'Quản trị' })).toBeVisible();
});

test('setup validates fields and never claims to save a shipment', async ({ page }) => {
  await page.goto('/batches/new');
  await page.getByRole('button', { name: 'Tạo Shipment', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('Điểm xuất phát');
  for (const [name, value] of [['product', 'Sản phẩm thử'], ['lot', 'LOT-TEST'], ['origin', 'Kho demo'], ['destination', 'Điểm demo'], ['reference', 'REF-TEST'], ['sop', 'SOP-TEST']]) await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('[name="start"]').fill('2026-10-09T08:00');
  await page.locator('[name="end"]').fill('2026-10-08T18:00');
  await page.getByRole('button', { name: 'Tạo Shipment', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('Thời gian kết thúc');
  await page.locator('[name="end"]').fill('2026-10-09T18:00');
  await page.getByRole('button', { name: 'Tạo Shipment', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('chưa lưu hoặc tạo Shipment');
  await page.getByRole('button', { name: 'Bỏ gán' }).first().click();
  await expect(page.getByRole('cell', { name: 'DEV-DEMO-01', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Đặt lại form' }).click();
  await expect(page.locator('[name="product"]')).toHaveValue('');
});

test('API errors, retry and empty state remain distinct', async ({ page }) => {
  await page.route('**/api/backend/batches', route => route.fulfill({ status: 503, json: {} }));
  await page.goto('/batches');
  await expect(page.locator('main').getByRole('alert')).toContainText('Không kết nối được API');
  await page.route('**/api/backend/batches', route => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Chưa có lô trên server.', exact: true })).toBeVisible();
});

test('logger dialog filters, stages selection, cancels and restores focus', async ({ page }) => {
  await page.goto('/batches/new');
  const opener = page.getByRole('button', { name: 'Gán thiết bị', exact: true });
  await expect(opener).toBeDisabled();
  for (const [name, value] of [['product', 'Sản phẩm demo'], ['lot', 'LOT-LOGGER'], ['origin', 'Kho demo'], ['destination', 'Điểm demo'], ['reference', 'REF-LOGGER'], ['sop', 'SOP-LOGGER']]) await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('[name="start"]').fill('2026-10-09T08:00');
  await page.locator('[name="end"]').fill('2026-10-09T18:00');
  await page.getByRole('button', { name: 'Tạo Shipment', exact: true }).click();
  await opener.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds?.width).toBe(780);
  expect(bounds?.y).toBe(0);
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBe(page.viewportSize()?.width);
  await expect(dialog.getByText('2027-11-30', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Kho demo - khu 1', { exact: true })).toBeVisible();
  await page.screenshot({ path: '../../.cache/assign-logger-drawer-desktop.png', caret: 'initial' });
  await expect(dialog.getByRole('checkbox', { name: 'Chọn DEV-DEMO-04', exact: true })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Chọn DEV-DEMO-03', exact: true }).check();
  await dialog.getByRole('button', { name: 'Hủy lựa chọn' }).click();
  await expect(opener).toBeFocused();
  await expect(page.getByRole('cell', { name: 'DEV-DEMO-03', exact: true })).toHaveCount(0);
  await opener.click();
  await dialog.getByRole('button', { name: 'Bỏ chọn DEV-DEMO-01', exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Chọn DEV-DEMO-01', exact: true })).not.toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Chọn DEV-DEMO-01', exact: true }).check();
  await dialog.getByRole('button', { name: 'Đóng hộp thoại' }).focus();
  await page.keyboard.press('Control+k');
  await expect(dialog.getByLabel('Tìm thiết bị', { exact: true })).toBeFocused();
  await dialog.getByLabel('Tìm thiết bị').fill('not-found');
  await expect(dialog.getByRole('cell', { name: 'Không có thiết bị khớp bộ lọc.' })).toBeVisible();
  await dialog.getByLabel('Tìm thiết bị').fill('SN-DEMO-03');
  await dialog.getByRole('checkbox', { name: 'Chọn tất cả thiết bị khả dụng đang hiển thị' }).check();
  await dialog.getByRole('button', { name: 'Gán 3 thiết bị vào form' }).click();
  await expect(page.getByRole('cell', { name: 'DEV-DEMO-03', exact: true })).toBeVisible();
  await opener.click();
  await dialog.getByLabel('Bộ lọc hiệu chuẩn', { exact: true }).selectOption('EXPIRED');
  await expect(dialog.getByRole('checkbox', { name: 'Chọn tất cả thiết bị khả dụng đang hiển thị' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await opener.click();
  expect((await dialog.boundingBox())?.width).toBe(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Gán 3 thiết bị vào form' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Gán 3 thiết bị vào form' })).toBeInViewport();
  await page.screenshot({ path: '../../.cache/assign-logger-mobile.png', caret: 'initial' });
});

for (const width of [390, 1366, 1920]) test(`screens fit ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  for (const route of ['/login', '/register', '/batches/new', '/batches']) {
    await page.goto(route);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `../../.cache/unified-${width}-${route.replaceAll('/', '-')}.png`, fullPage: true, caret: 'initial' });
  }
});

test('Shipment → devices → handover → Import preserves context and invalidates edited preparation', async ({ page }) => {
  await page.goto('/imports');
  await expect(page.getByText('Chưa hoàn thành Tạo Shipment', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Tiếp tục chuẩn bị Shipment' }).click();
  await expect(page.getByRole('button', { name: 'Ghi nhận bàn giao', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Gán thiết bị', exact: true })).toBeDisabled();
  for (const [name, value] of [['product', 'Sản phẩm demo'], ['lot', 'LOT-FLOW'], ['origin', 'Kho mô phỏng'], ['destination', 'Điểm mô phỏng'], ['reference', 'WAY-FLOW'], ['sop', 'SOP-FLOW']]) await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('[name="start"]').fill('2026-10-09T08:00');
  await page.locator('[name="end"]').fill('2026-10-09T18:00');
  await page.getByRole('button', { name: 'Tạo Shipment', exact: true }).click();
  await page.getByRole('button', { name: 'Tiếp tục: Gán thiết bị' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Gán 2 thiết bị vào form' }).click();
  await page.getByRole('button', { name: 'Tiếp tục: Ghi nhận bàn giao' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ghi nhận bàn giao' });
  await dialog.getByRole('button', { name: 'Hủy bàn giao' }).click();
  await expect(page.getByRole('link', { name: 'Tiếp tục sang Import' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tiếp tục: Ghi nhận bàn giao' }).click();
  await dialog.getByRole('button', { name: 'Lưu bàn giao vào form' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Địa điểm');
  await dialog.getByLabel('Thời gian bàn giao', { exact: true }).fill('2026-10-09T19:00');
  await expect(dialog.getByText('Thời gian bàn giao nằm ngoài khung giờ', { exact: false })).toBeVisible();
  await dialog.getByLabel('Thời gian bàn giao', { exact: true }).fill('2026-10-09T10:00');
  for (const [label, value] of [['Địa điểm bàn giao', 'Cổng demo'], ['Bên giao', 'Kho demo'], ['Bên nhận', 'Vận chuyển demo'], ['Người giao', 'Người thử A'], ['Người nhận', 'Người thử B']]) await dialog.getByLabel(label, { exact: true }).fill(value);
  const upload = dialog.getByLabel('Chọn tài liệu bàn giao', { exact: true });
  await upload.setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('demo') });
  await expect(dialog.getByText('Chọn PDF, PNG hoặc JPG không quá 15 MB.', { exact: true })).toBeVisible();
  await upload.setInputFiles({ name: 'receipt-demo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% synthetic preview') });
  await expect(dialog.getByRole('link', { name: 'Xem tài liệu' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole('button', { name: 'Lưu bàn giao vào form' })).toBeInViewport();
  await page.screenshot({ path: '../../.cache/handover-mobile.png', caret: 'initial' });
  await dialog.getByRole('button', { name: 'Lưu bàn giao vào form' }).click();
  await page.getByRole('link', { name: 'Tiếp tục sang Import' }).click();
  await expect(page.getByRole('definition').filter({ hasText: /^LOT-FLOW$/ })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: /^DEV-DEMO-01, DEV-DEMO-02$/ })).toBeVisible();
  await expect(page.getByText('receipt-demo.pdf', { exact: true })).toBeVisible();
  const loggerFile = page.getByLabel('Chọn file nhiệt độ', { exact: true });
  await loggerFile.setInputFiles({ name: 'report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF demo') });
  await expect(page.locator('main').getByRole('alert')).toContainText('CSV, TSV hoặc TXT');
  await loggerFile.setInputFiles({ name: 'logger-test.csv', mimeType: 'text/csv', buffer: Buffer.from('timestamp,temp\n2026-10-09T01:00:00Z,4') });
  await page.getByRole('button', { name: 'Kiểm tra file trên server' }).click();
  await expect(page.getByRole('status')).toContainText('Chưa gửi file hoặc tạo import job');
  await page.getByRole('button', { name: 'Xem mẫu Import mô phỏng' }).click();
  await expect(page.getByRole('cell', { name: 'row:3', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Trang sau' }).click();
  await expect(page.getByRole('cell', { name: 'row:5', exact: true })).toBeVisible();
  await page.getByLabel('Chỉ xem dòng có cờ').check();
  await expect(page.getByRole('cell', { name: 'row:3', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'row:5', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'row:1', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Xem kết quả mô phỏng' }).click();
  await expect(page.getByText('Mô phỏng · REQUIRES_REVIEW', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../../.cache/import-workbench-mobile.png', fullPage: true, caret: 'initial' });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({ path: '../../.cache/import-workbench-desktop.png', fullPage: true, caret: 'initial' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../../.cache/import-workbench-wide.png', fullPage: true, caret: 'initial' });
  await page.getByRole('link', { name: 'Quay lại kiểm tra Shipment' }).click();
  await expect(page.locator('[name="product"]')).toHaveValue('Sản phẩm demo');
  await expect(page.locator('[name="lot"]')).toHaveValue('LOT-FLOW');
  await page.locator('[name="product"]').fill('Sản phẩm demo sửa');
  await expect(page.getByRole('link', { name: 'Tiếp tục sang Import' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ghi nhận bàn giao', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Đặt lại form' }).click();
  await expect(page.locator('[name="product"]')).toHaveValue('');
  await page.getByRole('navigation', { name: 'Menu chính' }).getByRole('link', { name: 'Import', exact: true }).click();
  await expect(page.getByLabel('Chọn file nhiệt độ', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Xem mẫu Import mô phỏng' })).toBeDisabled();
});

test('read proxy forwards API data with the session token and blocks unknown resources', async () => {
  const original = globalThis.fetch;
  const request = (path: string) => new NextRequest(`http://localhost/api/backend/${path}`, { headers: { cookie: 'cp_token=abc' } });
  try {
    let authorization: string | null = null;
    globalThis.fetch = async (_input, init) => { authorization = new Headers(init?.headers).get('authorization'); return Response.json([{ id: 'SERVER-BATCH' }]); };
    const result = await GET(request('batches'), { params: Promise.resolve({ path: ['batches'] }) });
    expect(await result.json()).toEqual([{ id: 'SERVER-BATCH' }]);
    expect(authorization).toBe('Bearer abc');
    expect((await GET(request('nope'), { params: Promise.resolve({ path: ['nope'] }) })).status).toBe(404);
    globalThis.fetch = async () => { throw new Error('offline'); };
    expect((await GET(request('batches'), { params: Promise.resolve({ path: ['batches'] }) })).status).toBe(503);
  } finally { globalThis.fetch = original; }
});

test('reports registry reads server metadata, filters and opens preview with audit', async ({ page }) => {
  const report = { id: '77777777-0000-0000-0000-000000000001', batch_id: 'CP-UI-TEST', version: 2, uri: null, checksum_sha256: 'a'.repeat(64), created_at: '2026-10-09T01:00:00Z', provenance: { report_id: 'RPT-CP-UI-TEST-v2', product_profile: 'DEMO_2_8C', scenario_id: 'S02', generated_by: 'qa@coldproof.local', segments: ['LEG-01'], source_assets: ['DS-01'], parser_versions: ['adapter:1.0.0'] } };
  const other = { ...report, id: '77777777-0000-0000-0000-000000000002', batch_id: 'CP-UI-OTHER', provenance: { ...report.provenance, report_id: 'RPT-CP-UI-OTHER-v1' } };
  await page.route('**/api/backend/reports', route => route.fulfill({ json: [report, other] }));
  await page.route('**/api/backend/audit', route => route.fulfill({ json: [{ id: 'audit-1', action: 'REPORT_GENERATED', entity_type: 'reports', entity_id: report.id, actor_id: null, created_at: '2026-10-09T01:00:00Z' }, { id: 'audit-2', action: 'IMPORT_COMPLETED', entity_type: 'source_assets', entity_id: 'x', actor_id: null, created_at: '2026-10-09T01:00:00Z' }] }));
  await page.route('**/api/backend/batches/CP-UI-TEST', route => route.fulfill({ json: { id: 'CP-UI-TEST', business_context_origin: 'SYNTHETIC', lower_threshold: 2, upper_threshold: 8 } }));
  await page.route('**/api/backend/batches/CP-UI-TEST/exceptions', route => route.fulfill({ json: { exceptions: [{ id: 'e1' }], quality_issues: [] } }));
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Hồ sơ bằng chứng' })).toBeVisible();
  await expect(page.getByText('Hiển thị 2 / 2 hồ sơ')).toBeVisible();
  await page.getByLabel('Lọc mã lô').selectOption('CP-UI-TEST');
  await expect(page.getByText('Hiển thị 1 / 1 hồ sơ')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Chọn hồ sơ RPT-CP-UI-TEST-v2' }).check();
  await expect(page.getByRole('button', { name: 'Đã chọn 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Xem audit' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Hồ sơ RPT-CP-UI-TEST-v2' })).toBeVisible();
  await expect(dialog.getByText('Mô phỏng', { exact: true })).toBeVisible();
  await expect(dialog.getByText('2°C – 8°C')).toBeVisible();
  await expect(dialog.getByRole('cell', { name: 'REPORT_GENERATED' })).toBeVisible();
  await expect(dialog.getByRole('cell', { name: 'IMPORT_COMPLETED' })).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'Tải gói bằng chứng JSON' })).toHaveAttribute('href', `/api/backend/reports/${report.id}/download`);
  await dialog.getByRole('button', { name: 'Đóng hộp thoại' }).click();
  await expect(dialog).toHaveCount(0);
});

test('reports registry shows API error and empty state', async ({ page }) => {
  await page.route('**/api/backend/reports', route => route.fulfill({ status: 503, json: {} }));
  await page.goto('/reports');
  await expect(page.locator('main').getByRole('alert')).toContainText('Không kết nối được API');
  await page.route('**/api/backend/reports', route => route.fulfill({ json: [] }));
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await expect(page.getByRole('cell', { name: 'Chưa có hồ sơ trên server.' })).toBeVisible();
});

test('every workflow screen shows the same 7-step process with the right current step', async ({ page }) => {
  for (const [path, step] of [['/batches/new', 'Tạo Shipment'], ['/imports', 'Import'], ['/batches/CP-UI-TEST', 'Phân tích'], ['/qa', 'QA review'], ['/reports', 'Hồ sơ']]) {
    await page.goto(path);
    const process = page.getByRole('navigation', { name: 'Quy trình xử lý lô' });
    await expect(process.getByRole('listitem')).toHaveCount(7);
    await expect(process.locator('[aria-current=step]')).toContainText(step);
  }
  await expect(page.getByRole('navigation', { name: 'Quy trình xử lý lô' }).getByRole('link', { name: 'Phân tích' })).toHaveAttribute('href', '/batches');
  await page.goto('/batches/CP-UI-TEST');
  await expect(page.getByRole('navigation', { name: 'Quy trình xử lý lô' }).getByRole('link', { name: 'Phân tích' })).toHaveAttribute('href', '/batches/CP-UI-TEST');
  await expect(page.getByRole('link', { name: 'Tiếp tục: QA review' })).toHaveAttribute('href', '/qa');
});

test('profiles merge form fixtures with server batch profiles and prefill shipment setup', async ({ page }) => {
  await page.route('**/api/backend/batches', route => route.fulfill({ json: [{ id: 'CP-UI-TEST', profile_id: 'SERVER_2_8C', lower_threshold: 2, upper_threshold: 8, created_at: '2026-10-09T01:00:00Z' }] }));
  await page.goto('/profiles');
  await expect(page.getByRole('heading', { name: 'Profile nhiệt độ' })).toBeVisible();
  await expect(page.getByText('Hiển thị 3 / 3 profile')).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: 'Chưa đồng bộ' })).toContainText('SERVER_2_8C');
  await page.getByRole('button', { name: /Từ lô server/ }).click();
  await expect(page.getByText('Hiển thị 1 / 3 profile')).toBeVisible();
  await page.getByRole('button', { name: 'Xem chi tiết' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: 'CP-UI-TEST' })).toHaveAttribute('href', '/batches/CP-UI-TEST');
  await expect(dialog.getByRole('link', { name: 'Tạo Shipment với profile này' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Đóng hộp thoại' }).click();
  await page.getByRole('button', { name: /Trong form/ }).click();
  await page.getByRole('button', { name: 'Xem chi tiết' }).nth(1).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Tạo Shipment với profile này' }).click();
  await expect(page).toHaveURL(/\/batches\/new\?profile=PROFILE-DEMO-FROZEN/);
  await expect(page.locator('select').filter({ hasText: 'PROFILE-DEMO-FROZEN' })).toHaveValue('PROFILE-DEMO-FROZEN');
});
