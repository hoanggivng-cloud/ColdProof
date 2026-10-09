# ColdProof

ColdProof gom dữ liệu nhiệt độ của lô hàng chuỗi lạnh dược thành hồ sơ bằng chứng có truy vết nguồn để QA xem xét. Dự án của đội **APEX** cho **GenD Arena 2026**.

Luồng xử lý: nhập file nhiệt độ từ nhiều thiết bị/format → chuẩn hóa → gắn vào lô theo khung giờ thiết bị → phát hiện sự cố và vấn đề chất lượng dữ liệu → QA xem xét → xuất hồ sơ bằng chứng có provenance.

> **Phạm vi dữ liệu.** Số đo nhiệt độ lấy từ dataset công khai (Zenodo, Mendeley). Lô, chặng, thiết bị và bàn giao là bối cảnh **mô phỏng** (`SYNTHETIC`) và luôn được gắn nhãn "Mô phỏng" trên giao diện. Hệ thống không kết luận lô đạt/không đạt; quyết định thuộc về người có thẩm quyền QA.

## Hiện trạng (MVP đang phát triển)

| Phần | Đã có | Chưa có |
| --- | --- | --- |
| Dữ liệu | Manifest SHA-256 của nguồn công khai, adapter Zenodo, kiểm tra chất lượng dữ liệu (`MISSING_INTERVAL`, trùng, xung đột) | Parser cho các format thiết bị khác, worker import qua BullMQ |
| API | REST + Swagger; đọc lô, số đo, sự cố, QA review, hồ sơ, nguồn, audit; đăng nhập; RBAC cho thao tác review | API tạo lô, gán thiết bị, bàn giao, quản lý profile; xuất PDF |
| Web | Đăng nhập, menu theo role, quy trình 7 bước, danh sách lô, chi tiết lô (biểu đồ nhiệt độ, chặng, mốc thời gian), hàng đợi và chi tiết QA, hồ sơ bằng chứng, profile nhiệt độ | Gửi QA review và tạo hồ sơ từ giao diện |
| Kịch bản demo | Seed lô `CP-DEMO-001` (kịch bản S02: vượt ngưỡng tại bàn giao) | Các kịch bản S01, S03–S07 |

Tạo Shipment, gán thiết bị, bàn giao và Import trên web hiện chỉ chạy trong form với fixture mô phỏng, chưa lưu xuống server.

## Cấu trúc

| Thư mục | Nội dung |
| --- | --- |
| `apps/web` | Next.js 16 + React 19 + TypeScript. Ghi chú giao diện: [`apps/web/UI-NOTES.md`](apps/web/UI-NOTES.md) |
| `apps/api` | NestJS + Prisma (PostgreSQL). Migration và seed trong `apps/api/prisma` |
| `packages` | `canonical-schema`, `parser-contracts`, `scenario-schema`, `shared-types` |
| `data` | Manifest nguồn, fixture, kịch bản, kết quả mong đợi. Xem [`data/README.md`](data/README.md) |
| `tests` | Unit, parser-contract, scenario-regression, integration, e2e |
| `infra` | Docker Compose: PostgreSQL, Redis, MinIO |
| `docs` | Kiến trúc, API contract, provenance, thiết kế kịch bản, phân công |

## Chạy local

Cần Node.js 22.12+ (22 hoặc 24), pnpm 10.28.2, Docker Desktop (Compose 2.20+).

```bash
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
corepack enable                 # hoặc: npm install -g pnpm@10.28.2
pnpm install --frozen-lockfile
pnpm db:generate
docker compose up -d --wait     # PostgreSQL, Redis, MinIO
pnpm db:migrate
pnpm db:seed                    # nạp lô demo CP-DEMO-001 và tài khoản demo
pnpm dev                        # API :3001 + web :3000
```

- Mở `.env` và đổi `JWT_SECRET`. Không commit `.env`.
- Nếu cổng 5432 đã bị PostgreSQL khác chiếm, đổi `POSTGRES_PORT` và cổng trong `DATABASE_URL` (ví dụ 15432).
- Thêm `NEXT_PUBLIC_APP_ENV=demo` vào `.env` để hiện dải "Môi trường demo" và nút đăng nhập nhanh trên màn đăng nhập.
- MinIO được build từ source; lần chạy đầu có thể mất vài phút.
- Dữ liệu nguồn đầy đủ không nằm trong Git. Tải theo hướng dẫn trong [`data/README.md`](data/README.md) rồi chạy `pnpm data:setup` và `pnpm data:verify`.

| Dịch vụ | Địa chỉ |
| --- | --- |
| Web | http://localhost:3000 |
| API / Swagger | http://localhost:3001/api/health · http://localhost:3001/docs |
| PostgreSQL / Redis | 5432 (theo `POSTGRES_PORT`) / 6379 |
| MinIO API / Console | 9000 / 9001 |

### Tài khoản demo (sau `pnpm db:seed`)

| Vai trò | Email |
| --- | --- |
| Operator | `operator@coldproof.local` |
| QA Reviewer | `qa@coldproof.local` |
| Admin | `admin@coldproof.local` |

Chỉ dùng cho môi trường local: backend hiện chưa kiểm tra mật khẩu và token chưa được ký.

## Kiểm tra

| Lệnh | Phạm vi | Cần DB |
| --- | --- | --- |
| `pnpm lint` · `pnpm typecheck` | Toàn repo | Không |
| `pnpm test:unit` | Unit, parser-contract, scenario-regression, spec trong `apps/api/src` | Không |
| `pnpm test:integration` | API qua HTTP | Có (`docker compose up`, `db:migrate`, `db:seed`) |
| `pnpm test` | Tất cả test Jest | Có |
| `pnpm test:e2e` | Playwright ở `tests/e2e` | Không |
| `pnpm build` | Build mọi package và app | Không |

Test giao diện web (Playwright, giả lập phản hồi API), chạy trong `apps/web`:

```bash
pnpm exec playwright install chromium   # lần đầu
pnpm exec playwright test --config playwright.config.ts
```

## Tài liệu và quy ước

- Quy tắc cho người và AI agent: [`AGENTS.md`](AGENTS.md) (bất biến dữ liệu, phạm vi owner, quy ước code và giao diện).
- Kiến trúc: [`docs/architecture.md`](docs/architecture.md) · API: [`docs/api-contract.md`](docs/api-contract.md) · Provenance: [`docs/data-provenance.md`](docs/data-provenance.md) · Kịch bản: [`docs/scenario-design.md`](docs/scenario-design.md)
- Phân công: TV1 dữ liệu/parser, TV2 backend/nghiệp vụ, TV3 frontend, TV4 QA/hồ sơ/hạ tầng. Chi tiết: [`docs/team-ownership.md`](docs/team-ownership.md), quy trình: [`docs/contributing.md`](docs/contributing.md).
- Làm việc qua feature branch và PR; không push trực tiếp lên `main`. Commit theo Conventional Commits kèm requirement ID.
