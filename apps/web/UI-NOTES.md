# Frontend hiện tại

## Hệ thiết kế

- Token duy nhất ở `src/app/globals.css` (`--color-*`, `--text-*`, `--space-*`, `--radius-*`, `--control-height`). Component không hard-code màu/khoảng cách.
- Màu: thanh trên `#0E1E3A`; nhấn `#1F3A68` (hover `#172E54`); nền `#F5F7FA`, panel `#FFFFFF`; chữ `#14171F` / phụ `#4A5568` / viền `#D9DEE7`. Đỏ `#B42318` chỉ cho vượt ngưỡng/lỗi; hổ phách `#B54708` (nền `#FEF6EE`, viền `#F0C9A8`) chỉ cho cảnh báo. Nền/viền đỏ `#FEF3F2` / `#F4C7C3`.
- Font IBM Plex Sans / Plex Mono qua `next/font/google` (latin + vietnamese). Số, mã, thời gian dùng `.number` (mono, tabular-nums, căn phải trong bảng).
- Cỡ chữ 12/13/14/15/20/24; lưới 4/8px; bo góc 4–6px; viền 1px, không bóng đổ; nút và ô nhập cao 40px; hàng bảng 40px, header dính.
- Component dùng chung trong `src/components/ui`: `Button` (primary/secondary/text), `Field`, `Badge` (“Mô phỏng” viền gạch), `Alert` (info/warning/error), `Table`, `Panel`; `layout/PageHeader` (breadcrumb, meta, hành động), `layout/AppShell` (thanh trên, menu chữ, role, Đăng xuất).

## Đăng nhập và role

- Mọi màn cần phiên đăng nhập (`src/proxy.ts` chuyển về `/login?next=…`). `/register` chuyển về `/login`: tài khoản do Admin cấp.
- `POST /api/session` gọi `POST /api/auth/login` của backend, lưu token và user vào cookie httpOnly; `DELETE /api/session` đăng xuất. Proxy đọc dữ liệu gửi token dạng `Authorization: Bearer`.
- Role giao diện: OPERATOR (backend seed hiện dùng DATA_ENGINEER), QA_REVIEWER, ADMIN. `RoleGate` ẩn nút/khối theo role; backend vẫn phải chặn.
- `NEXT_PUBLIC_APP_ENV=demo` hiện dải “Môi trường demo · dữ liệu mô phỏng” và khối đăng nhập nhanh 3 tài khoản demo.
- Backend hiện chỉ kiểm email, không kiểm mật khẩu; token là JSON base64 không ký. Cần TV4 xử lý trước khi dùng thật.

Màn tạo Shipment: `/batches/new`. Profile và thiết bị là fixture SYNTHETIC; không ghi vào database. Chưa có endpoint tạo lô, gán thiết bị hoặc lưu nháp ở backend.

Nút **Gán thiết bị** mở ngăn bên phải chọn logger: tìm mã/serial/model (Ctrl/⌘+K), lọc nhà sản xuất, hiệu chuẩn và khả dụng; xem hạn hiệu chuẩn, vị trí lưu giữ. Chọn tất cả chỉ tác động thiết bị được phép chọn trong bộ lọc hiện tại; có thể bỏ chọn bằng nút trên từng chip. Xác nhận cập nhật form; Hủy/Đóng/Escape bỏ thay đổi đang chỉnh. Quyền chọn và lý do khóa lấy từ props/fixture, không tính quy tắc nghiệp vụ ở client. Thanh nguồn dữ liệu ghi rõ SYNTHETIC và chưa ghi audit trên server.

Các màn đọc dữ liệu dùng `GET /api/backend/*` của Next.js để gọi NestJS. Địa chỉ server lấy từ `API_URL`, sau đó `NEXT_PUBLIC_API_URL`, mặc định `http://localhost:3001/api`. Không tự thay dữ liệu lỗi bằng mock.

Đã nối đọc danh sách/chi tiết lô, số đo, sự cố, nguồn, review và report metadata. Server/DB cần chạy để có dữ liệu thật từ API. Đăng nhập dùng API thật (xem trên). Chưa nối upload file, duyệt QA hoặc xuất PDF.

Chạy từ thư mục gốc:

```powershell
corepack pnpm --filter @coldproof/web dev
node node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
node node_modules/eslint/bin/eslint.js apps/web
```

Chạy từ `apps/web`:

```powershell
node ../../node_modules/@playwright/test/cli.js test --config playwright.config.ts
node node_modules/next/dist/bin/next build --webpack
```

Test frontend dùng phản hồi API có kiểm soát để kiểm tra UI và proxy. Chúng không xác minh database hoặc backend đang chạy.

## Quy trình chuẩn bị lô mới

Quy trình đầy đủ: **Tạo Shipment → Gán thiết bị → Ghi nhận bàn giao → Import → Phân tích → QA review → Hồ sơ**. Thanh “Quy trình xử lý lô” (7 bước, `WorkflowProgress`) hiện trên Overview, `/batches/new`, `/imports`, `/batches/:id`, `/qa`, `/qa/:id`, `/reports`; mỗi bước là link tới màn tương ứng. Bước 1–4 ghi rõ “Chưa lưu server” (chỉ trong form); bước 5–7 ghi “Dữ liệu server”. Mỗi màn có nút “Tiếp tục: …” sang bước sau; sidebar xếp theo cùng thứ tự.

Phạm vi form frontend FR-UI: **Tạo Shipment → Gán thiết bị → Ghi nhận bàn giao → Import**.

1. Vào `/batches/new`, nhập thông tin và bấm **Tạo Shipment** để kiểm tra form mô phỏng. Chưa tạo bản ghi/mã lô trên server.
2. Bấm **Tiếp tục: Gán thiết bị**, chọn logger và xác nhận. Không thể mở bước gán trước khi thông tin Shipment hợp lệ.
3. Bấm **Tiếp tục: Ghi nhận bàn giao**. Nhập thời gian UTC+7, địa điểm, bên/người giao nhận, tham chiếu và ghi chú. PDF/PNG/JPG tối đa 15 MB chỉ xem trong trình duyệt, không upload. Thời gian ngoài khung giờ tạo cảnh báo nhập liệu, không tạo exception nghiệp vụ. Bấm **Lưu bàn giao vào form**.
4. Bấm **Tiếp tục sang Import**. Thông tin lô, profile, thiết bị và bàn giao được chuyển qua React context. Chưa upload file nhiệt độ hoặc tạo import job.

Hủy bàn giao không hoàn thành bước 3. Sửa thông tin Shipment phải kiểm tra và xác nhận lại các bước sau; thay đổi thiết bị phải ghi nhận lại bàn giao. **Đặt lại form** xóa tiến trình. Dữ liệu chỉ trong bộ nhớ của phiên ứng dụng: chuyển trang nội bộ giữ dữ liệu, tải lại/đóng tab làm mất dữ liệu. Không lưu tên người hoặc tài liệu vào localStorage.

Backend còn thiếu API tạo lô, gán thiết bị, ghi nhận bàn giao và upload tài liệu. Không sửa backend/contract trong task frontend này; cần owner TV2/TV4 triển khai trước khi chuyển thành quy trình lưu dữ liệu thật.

## Màn Import logger

`/imports` hiển thị bốn phần: chọn file → kiểm tra/mapping → xem trước → kết quả import. Chọn file và xem mẫu chỉ mở sau khi hoàn thành ba bước chuẩn bị Shipment.

- Chọn hoặc kéo thả CSV/TSV/TXT: chỉ giữ file trong bộ nhớ trình duyệt, chưa upload/parse. PDF/XLSX và file trống báo lỗi. Không khẳng định parser hỗ trợ format chỉ dựa trên đuôi file.
- **Xem mẫu Import mô phỏng** gọi service fixture riêng; số đo, cờ và thống kê được định nghĩa trước, không tính sự cố tại client. Mẫu không phải nội dung file được chọn. Không xóa dòng trùng, dòng thiếu timestamp hoặc tự nội suy.
- Bảng có lọc dòng có cờ và phân trang. Timestamp gốc vẫn nằm trong typed fixture, hiển thị theo UTC+7. Dữ liệu preview là dòng thô, không được ghi làm canonical record.
- **Xem kết quả mô phỏng** chỉ đổi phần hiển thị; không tạo review task, không kết luận lô và không ghi audit. **Kiểm tra file trên server** thông báo rõ backend còn thiếu worker/upload, không gửi file hay tạo job giả.

Không hiển thị checksum, chữ ký, chứng nhận hoặc số liệu chất lượng tự bịa từ HTML mẫu. Hợp đồng preview là kiểu dữ liệu nội bộ frontend, chưa phải thay đổi OpenAPI.

## Màn Hồ sơ bằng chứng

`/reports` theo bố cục mẫu “Compliance Reports”: ô chỉ số, thanh SHA-256, tab có số đếm, bộ lọc (Ctrl/⌘+K), bảng, phân trang số trang và footer lưu ý. Danh sách đọc `GET /reports`; modal xem trước đọc thêm `GET /audit` (lọc theo `entity_id` của hồ sơ), `GET /batches/:id` (nhãn xuất xứ, ngưỡng profile) và `GET /batches/:id/exceptions` (số sự cố, số vấn đề chất lượng). Giao diện không tự tính nhiệt độ, sự cố hay trạng thái hồ sơ.

- Chỉ số, bộ lọc mã lô/profile, chọn dòng, phân trang và CSV đều dựa trên dữ liệu tải về; không tự tạo trạng thái hồ sơ (bản nháp, chờ QA, đã khóa…) vì API chưa trả trường này.
- SHA-256 hiển thị đúng như server trả về, chưa tính lại ở client. **Tải gói bằng chứng JSON** gọi `GET /reports/:id/download`; xuất PDF và tạo hồ sơ mới chưa được nối.
- Đã bỏ khỏi HTML mẫu: nhãn GxP/21 CFR Part 11, tên sản phẩm/vaccine, người duyệt, site và số liệu tự bịa.

## Màn Profile nhiệt độ

`/profiles` (sidebar “Profiles”) theo cùng bố cục với `/reports`. Danh sách gộp hai nguồn theo mã profile:

- **Trong form**: fixture `src/mocks/shipment-setup.ts` (SYNTHETIC), chính là danh sách profile của màn Tạo Shipment.
- **Từ lô server**: gom `profile_id`, `lower_threshold`, `upper_threshold` từ `GET /batches`. Backend chưa có API profile riêng.

Profile chỉ có trên server được báo “Chưa đồng bộ” vì form Tạo Shipment không chọn được. Ngăn chi tiết hiện ngưỡng, cách so ngưỡng (vượt khi `< dưới` hoặc `> trên`) và các lô dùng profile. Với profile trong form, nút **Tạo Shipment với profile này** mở `/batches/new?profile=<id>` và chọn sẵn profile. Chưa có tạo/sửa profile; đã bỏ tên thuốc, nhãn 21 CFR, “allowed excursion”, trạng thái ACTIVE/REVISION và hash tự bịa trong HTML mẫu.
