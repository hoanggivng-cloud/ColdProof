# ColdProof

ColdProof là dự án workflow dữ liệu và bằng chứng cho chuỗi lạnh dược của đội **APEX**, hướng tới **GenD Arena 2026**.

Luồng dự kiến: nguồn dữ liệu → nhập file → parser → chuẩn hóa → kiểm tra chất lượng → gắn lô/chặng → ngoại lệ → QA review → báo cáo có truy vết nguồn.

Repository hiện chỉ là **khung ban đầu**, chưa có dữ liệu mẫu hay nghiệp vụ hoàn chỉnh. MVP dự kiến dùng dữ liệu công khai và ngữ cảnh nghiệp vụ mô phỏng; không thay thế quyết định của QA, chứng nhận GDP/GSP hoặc tích hợp vendor production.

## Công nghệ và cấu trúc

- `apps/web`: Next.js, React, TypeScript; các trang trống để phát triển UI.
- `apps/api`: NestJS, REST/Swagger, Prisma; các module nghiệp vụ.
- `packages`: canonical schema, parser contracts, scenario schema và shared types.
- `data`, `tests`: thư mục cho dữ liệu và kiểm thử sau này.
- `infra`: PostgreSQL, Redis, MinIO qua Docker Compose.

## Chạy local

Cần Node.js 22.12+ (22/24), pnpm 10.28.2 và Docker Compose 2.20+.

```bash
cp .env.example .env
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
docker compose up -d --wait
pnpm db:migrate
pnpm dev
```

PowerShell có thể dùng `Copy-Item .env.example .env`. Nếu cổng PostgreSQL 5432 bị chặn, đổi `POSTGRES_PORT` và cổng trong `DATABASE_URL` sang 15432. MinIO được build từ source; lần chạy đầu có thể mất vài phút. Không commit `.env`.

| Dịch vụ | Địa chỉ / cổng mặc định |
| --- | --- |
| Web | http://localhost:3000 |
| API / Swagger | http://localhost:3001/api/health · http://localhost:3001/docs |
| PostgreSQL / Redis | 5432 / 6379 |
| MinIO API / Console | 9000 / 9001 |

Kiểm tra: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Nhiều test đang là TODO; parser chưa được triển khai.

Phân công: TV1 dữ liệu/parser; TV2 backend/nghiệp vụ; TV3 frontend; TV4 QA/report/hạ tầng. Xem [ownership](docs/team-ownership.md). Làm việc qua feature branch và PR; không push trực tiếp lên `main`.
