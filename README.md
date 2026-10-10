# ColdProof

ColdProof của đội APEX là bản demo hồ sơ bằng chứng cho chuỗi lạnh dược.

Luồng demo hiện tại: **Operator tạo Shipment → sinh số đo mô phỏng → backend phát hiện sự cố → QA ghi nhận/chuyển cấp → xuất PDF/JSON → Admin quản lý quyền và audit**.

Số đo mới được sinh theo kịch bản và seed, luôn mang nhãn `SYNTHETIC`. Không upload file logger trong luồng demo này. Không có quyết định tự động về việc sử dụng hay loại bỏ sản phẩm.

## Chạy local

Cần Node.js 22.12+ (22/24), pnpm 10.28.2 và Docker Compose 2.20+.

```bash
cp .env.example .env
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Nếu chỉ demo workflow mới, PostgreSQL là dịch vụ cần thiết; Redis/MinIO chưa tham gia vào sinh số đo hoặc tạo báo cáo. Không commit `.env`. Tạo `JWT_SECRET` riêng cho môi trường triển khai.

| Dịch vụ | Địa chỉ |
| --- | --- |
| Web | http://localhost:3000 |
| API | http://localhost:3001/api |
| Swagger | http://localhost:3001/docs |

`db:seed` tạo ba tài khoản local: `operator@gmail.com`, `qa@gmail.com`, `admin@gmail.com`; mật khẩu demo `123456`. Chỉ dùng các tài khoản này trong môi trường demo local. Tài khoản đăng ký mới luôn là Operator; Admin cấp quyền QA hoặc Admin và có thể khóa tài khoản.

## Demo

1. Đăng nhập Operator, mở **Lô hàng → Tạo Shipment**.
2. Nhập mã lô mới, sản phẩm, tuyến đường, khung giờ, chọn profile và thiết bị. Lưu Shipment.
3. Có thể ghi nhận bàn giao; thông tin lưu server. Tệp đính kèm chỉ lưu tên/kích thước, chưa upload bytes.
4. Chọn **Sinh dữ liệu mô phỏng**, chọn kịch bản và seed. Mỗi lô chỉ sinh một lần.
5. Xem biểu đồ, số đo và sự cố. Đăng xuất, đăng nhập QA để ghi nhận hoặc chuyển cấp xử lý.
6. Xuất hồ sơ; mở **Hồ sơ → Xem trước → Tải PDF/JSON**.
7. Đăng nhập Admin để đổi quyền, khóa/mở tài khoản và xem audit.

Chi tiết: [demo workflow](docs/demo-workflow.md).

## Kiểm tra

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Test tích hợp cần PostgreSQL đã migrate/seed. Test benchmark cần bộ dữ liệu frozen:

```bash
pnpm data:restore
pnpm data:verify
```

Kho còn các test TODO kế thừa; không tính chúng là chức năng đã kiểm thử.

## Cấu trúc và giới hạn

- `apps/web`: Next.js/React/TypeScript.
- `apps/api`: NestJS/Prisma/PostgreSQL, RBAC, phân tích, QA và report.
- `packages`: các contract và logic phân tích dữ liệu độc lập.
- `data`: benchmark công khai và kịch bản mô phỏng.

Bản demo dùng schema batch/segment hiện có. Chưa chuyển toàn bộ hệ thống sang device-window spec v3.2; chưa hoàn thiện upload logger, queue worker, profile CRUD hoặc quản lý thiết bị production. Sinh dữ liệu và tạo report hiện chạy đồng bộ, có giới hạn tối đa 8 thiết bị và 121 số đo mỗi thiết bị. Không mô tả bản demo là đã đáp ứng toàn bộ spec production.
