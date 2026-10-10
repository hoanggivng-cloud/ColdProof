# Hướng dẫn Kiểm thử End-to-End (E2E) Workflow

Tài liệu này mô tả chi tiết các kịch bản kiểm thử E2E đã được xây dựng và cách bạn có thể tự chạy kiểm thử (cả tự động lẫn thủ công) để nghiệm thu toàn bộ luồng nghiệp vụ của ColdProof.

## 1. Cấu trúc Kiểm thử E2E

Hệ thống ColdProof tách biệt hai lớp kiểm thử E2E để đảm bảo tính chính xác:
- **Backend API Integration (`tests/integration/workflow-e2e.spec.ts`)**: Kiểm thử luồng dữ liệu (Data Flow) và phân quyền (RBAC) đi qua toàn bộ các module API, tương tác trực tiếp với Database thật qua Prisma.
- **Frontend UI E2E (`apps/web/tests/frontend.spec.ts`)**: Sử dụng Playwright để tự động hóa trình duyệt, kiểm thử UI/UX, thao tác điền form, và cách giao diện phản hồi với các trạng thái API (Mocked API).

---

## 2. Cách chạy kiểm thử tự động

### Kiểm thử Backend API Integration
Kịch bản này sẽ khởi chạy một server NestJS ảo, gọi các HTTP request theo đúng trình tự nghiệp vụ thực tế.
```bash
# Chạy E2E workflow cho Backend API
pnpm test:integration
```

### Kiểm thử Frontend Playwright
Kịch bản này mở trình duyệt và tự động bấm/điền các thông tin trên màn hình.
```bash
# Chạy E2E workflow cho Frontend UI
pnpm test:e2e
```

---

## 3. Kịch bản E2E Workflow (Luồng nghiệp vụ cốt lõi)

Nếu bạn muốn **tự test thủ công** trên trình duyệt (http://localhost:3000) và Swagger API (http://localhost:3001/docs), hãy làm theo 8 bước E2E sau:

### Bước 1: Đăng nhập & Xác thực (Auth)
- Truy cập màn hình Đăng nhập (Frontend).
- **Test:** Thử đăng nhập bằng tài khoản không tồn tại -> Cần báo lỗi `401 Unauthorized`.
- **Test:** Đăng nhập thành công với `operator@gmail.com` (Role: OPERATOR). Giao diện chuyển vào màn hình chính.

### Bước 2: Tạo Shipment & Gán thiết bị (Batch)
- Vào màn hình **"Tạo Shipment"** (`/batches/new`).
- Điền form: Tên sản phẩm, Lô thuốc, Chọn Profile nhiệt độ (ví dụ: `2°C - 8°C`).
- Gán thiết bị (Device) vào lô hàng và xác nhận.
- **Backend xử lý:** API `POST /api/batches` sẽ tạo lô hàng mới và thiết lập ranh giới (segment).

### Bước 3: Import Dữ liệu Nhiệt độ (Parser)
- Vào màn hình **"Import"** (`/imports`).
- Tải lên một file cấu hình hoặc file CSV nhiệt độ của thiết bị vừa gán.
- **Backend xử lý:** Hệ thống phân tích (Parse) dữ liệu, chuẩn hóa (Normalize) về `Canonical Measurement` và phát hiện các điểm vượt ngưỡng (Excursion).

### Bước 4: Kiểm tra Danh sách Lô (Analysis)
- Vào màn hình **"Lô hàng"** (`/batches`).
- Chọn lô vừa tạo để xem chi tiết.
- Dữ liệu nhiệt độ sẽ hiển thị, các điểm vượt mức hoặc đứt quãng sẽ bị bôi đỏ (Exception).

### Bước 5: Bắt lỗi Phân quyền (RBAC)
- Đang dùng tài khoản `OPERATOR`, nếu bạn cố tình gọi API duyệt sự cố (`POST /api/exceptions/:id/review`), hệ thống **phải** chặn lại với lỗi `403 Forbidden` (do thiếu quyền QA_REVIEWER).

### Bước 6: QA Review (Human-in-the-loop)
- Đăng xuất và đăng nhập lại bằng `qa@gmail.com` (Role: QA_REVIEWER).
- Vào màn hình **"QA"** (`/qa`).
- Mở sự cố của lô hàng vừa rồi, thêm nhận xét (ví dụ: "Nhiệt độ tăng do mở cửa, chấp nhận được") và ấn **Duyệt (Review)**.

### Bước 7: Xuất Hồ sơ Bằng chứng (Evidence Report)
- Chuyển sang màn hình **"Hồ sơ"** (`/reports`).
- Lô hàng đã được duyệt sẽ sinh ra một hồ sơ PDF & JSON đính kèm toàn bộ provenance.
- Bạn có thể tải file PDF xuống để kiểm chứng.

### Bước 8: Kiểm toán (Audit Trail)
- Gọi API `GET /api/audit` trên Swagger.
- Kiểm tra danh sách Audit, bạn sẽ thấy toàn bộ các bước vừa làm: `BATCH_CREATED`, `IMPORT_COMPLETED`, `QA_REVIEW_ACTION`, `REPORT_GENERATED` được ghi nhận theo thứ tự thời gian, không thể sửa xóa.
