# Demo workflow — DEMO-001

Phạm vi người dùng đã chốt: thay import logger bằng sinh số đo mô phỏng, chạy hết workflow trên lô mới, bổ sung quản trị tài khoản và push main.

## Chức năng

| Vai trò | Chức năng |
| --- | --- |
| Operator | Tạo/lưu Shipment, gán thiết bị demo, lưu bàn giao, sinh dữ liệu, xem số đo/sự cố/hồ sơ |
| QA Reviewer | Xem sự cố, đối chiếu số đo, ACKNOWLEDGE hoặc ESCALATE, nhập ghi chú, xuất hồ sơ |
| Admin | Các thao tác Operator/QA, xem tài khoản, đổi vai trò, khóa/mở tài khoản, xem audit |

Backend kiểm tra JWT ký HS256, hạn sử dụng và trạng thái tài khoản hiện tại. Vai trò được đọc lại từ database nên khóa hoặc thu hồi quyền có hiệu lực với token đã cấp. Tài khoản đăng ký mới không tự cấp quyền QA. Admin không tự khóa hoặc tự thu hồi quyền của mình.

## API demo

| Endpoint | Quyền |
| --- | --- |
| POST /api/batches | Operator, Admin |
| POST /api/batches/:id/handover | Operator, Admin |
| POST /api/batches/:id/simulate | Operator, Admin |
| POST /api/exceptions/:id/review | QA Reviewer, Admin |
| POST /api/batches/:id/reports | QA Reviewer, Admin |
| GET /api/reports/:id/pdf, /download, /audit | Người dùng đã đăng nhập |
| GET/PATCH /api/users, GET /api/audit | Admin |

## Kịch bản và provenance

NORMAL nằm trong ngưỡng; EXCURSION vượt ngưỡng trên ở khoảng giữa chuyến; MISSING bỏ mẫu ở khoảng giữa, không nội suy; CONFLICT giữ hai chuỗi lệch nhau. Nếu chỉ có một thiết bị, CONFLICT tạo thêm thiết bị mô phỏng thứ hai và ghi rõ trong cấu hình simulation.

Seed, generator version, cadence, thiết bị, source ID, import ID và checksum lưu trong context của lô. Source metadata và số đo có checksum. API tạo sự cố bằng phân tích từng chuỗi thiết bị trước khi insert, không sao chép cờ của lô seed. Số đo chỉ được insert trong workflow demo; QA thay trạng thái sự cố và ghi review/audit trong transaction, không sửa số đo.

Mỗi lô sinh một lần. Lặp request trả 409, không nhân đôi số đo. Khóa dòng batch trong transaction bảo vệ sinh dữ liệu và cấp version báo cáo. Báo cáo là snapshot số đo, vấn đề, review và cấu hình; JSON hash được tính với key sắp xếp. Hash này là hash JSON bằng chứng, không phải hash bytes PDF.

## Acceptance

- Tạo lô mới và lưu thông tin Shipment/bàn giao.
- Sinh hai chuỗi EXCURSION tạo hai sự cố, không trộn thiết bị.
- Operator review trả 403; QA review lưu notes và giữ nguyên số đo.
- NORMAL không tạo review task; MISSING chỉ xuất hiện ở đúng lô.
- PDF trả bytes `%PDF-`; JSON snapshot chứa đúng số đo và review của lô.
- Admin đổi quyền và khóa tài khoản; token cũ của tài khoản khóa trả 401.

Kiểm thử tự động: `tests/integration/workflow-e2e.spec.ts`, `apps/api/src/batches/demo-generator.spec.ts`.

## Giới hạn còn lại

Không upload bytes tài liệu bàn giao/logger, không queue worker, không profile CRUD production. Chặng trong demo là cửa sổ chuỗi thiết bị của Shipment, không chứng minh các chặng logistics thực. Legacy benchmark còn tồn tại độc lập. Những giới hạn này không được trình bày là chức năng đã hoàn thiện.

Bộ materialization frozen ghi checksum evidence-decision với CRLF. Script chuẩn hóa newline của riêng tài liệu decision về CRLF để kiểm tra giống nhau trên Linux/Windows; bytes dữ liệu observed không được biến đổi.
