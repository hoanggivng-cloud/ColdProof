# Playbook

## Giao việc cho agent

```
Đọc AGENTS.md, mục <TVx> trong agents/roles.md và mục <số> trong agents/playbooks.md.
Requirement: <FR-…, AC-…>
Mục tiêu: <1–2 câu>
Được sửa: <thư mục>      Không làm: <ngoài phạm vi>
Nghiệm thu: <input → output mong đợi>
Nêu kế hoạch trước khi code. Xong thì chạy test và viết mô tả PR theo mẫu cuối file này.
```

## 1. Thêm format / parser (TV1)

1. Ghi nguồn đặc tả vào `data/vendor_reference/<format>/SOURCE.md`.
2. Fixture ở `data/fixtures/vendor_inspired/<format>/`, sinh từ cùng giá trị observed của S05, kèm 1 file lỗi có chủ đích và `expected.canonical.json`.
3. Module `apps/api/src/parsers/<format>/` cài `ParserAdapter`; đăng ký bằng 1 dòng config. Không sửa lõi.
4. Test: output = expected = các format khác; unit cho bảng mã, dấu thập phân, dòng đầu file, múi giờ, °F.

| Format | Khác biệt |
| --- | --- |
| A | Dấu phẩy; `dd/mm/yyyy HH:mm`; UTF-8; 5 dòng đầu; 1 kênh °C; 1 phút/mẫu |
| B | Dấu chấm phẩy; thập phân dấu phẩy; UTF-16; 12 dòng đầu; kèm độ ẩm; 5 phút/mẫu |
| C | Tab; ISO 8601 có múi giờ; °F; 3 dòng đầu; 4 kênh; 2 phút/mẫu |
| D | Timestamp epoch; 20 dòng đầu; tên cột khác; 1 phút/mẫu |

Bẫy: đọc UTF-16 như UTF-8; `1,5` thành 15; nhầm dd/mm với mm/dd; làm tròn nhiệt độ khi parse.

## 2. Thêm endpoint (TV2 hoặc TV4)

1. Endpoint phải có trong spec Mục 11.2; chưa có → đề xuất sửa spec trước.
2. DTO validate bằng `class-validator` (whitelist); gắn guard role.
3. Mã lỗi theo spec Mục 13; 403 sai quyền, 409 chồng khung giờ, 422 quá hạn hiệu chuẩn.
4. Endpoint ghi dữ liệu → ghi `audit_events`. Việc nặng → BullMQ, trả `jobId`.
5. Đổi shape đã freeze → tăng version OpenAPI, báo TV3.
6. Test: đúng quyền 2xx; sai quyền 403 + có audit; input sai đúng mã lỗi.

## 3. Thêm migration (TV2)

1. Chỉ viết migration mới; không sửa migration đã merge.
2. Bảng mới có `org_id`; bảng chứa dữ liệu mô phỏng có `origin`.
3. `measurements`: khóa chính `(id, timestamp)`; không có `batch_id`/`segment_id`; field provenance `NOT NULL`.
4. Không `GRANT UPDATE/DELETE` trên `measurements`, `audit_events`.
5. Kiểm: migrate từ DB trống, seed, TC-014 pass.

## 4. Thêm kịch bản (TV1 → TV2 → TV4)

1. TV1 viết `data/scenarios/<Sxx>.yaml`: mỗi segment có `source` (vd. `zenodo/SENSOR06`), `device_id`, `format`, `SYNTHETIC`.
2. TV4 viết `data/expected/<Sxx>.json` từ manifest, trước khi chạy code.
3. Regression chạy 2 lần, hash JSON report phải giống nhau.

| Mã | Nội dung | Mong đợi |
| --- | --- | --- |
| S01 | Bình thường | 0 exception |
| S02 | Vượt ngưỡng tại bàn giao (CP-DEMO-001) | 1 excursion |
| S03 | Thiếu dữ liệu | Khoảng trống được flag |
| S04 | Xung đột cảm biến | 2 chuỗi + 1 review item |
| S05 | Tương đương format | A–D cùng canonical |
| S06 | Bối cảnh Mendeley | Tùy chọn (P2) |
| S07 | Đa thiết bị: 1 lô, 3 leg, 3 format | Lệch đồng hồ 3–5 phút, chồng khung giờ, thiếu 20 phút, 10 dòng trùng đều được flag |

## 5. Làm màn hình (TV3)

1. Xác định role dùng, endpoint, 1 hành động chính; nêu 3 quyết định bố cục trước khi code.
2. Đủ 4 trạng thái: đang tải, trống, lỗi, có cảnh báo. Ẩn nút role không có quyền, vẫn xử lý 403.
3. Thời gian theo `Asia/Ho_Chi_Minh`; nhãn "Mô phỏng" cho dữ liệu `SYNTHETIC`.
4. Biểu đồ: không nối qua khoảng trống; vẽ cả 2 chuỗi xung đột; vượt ngưỡng tô đỏ; mốc bàn giao là đường dọc có nhãn.
5. Phong cách theo `AGENTS.md` Mục 7. Kiểm bằng bàn phím, tương phản ≥ 4.5:1, ở 1366px và 1920px. PR kèm ảnh 4 trạng thái.

## Mẫu mô tả PR

```
Requirement: <FR-…, AC-…>        Owner: <TVx>
Thay đổi: <1–3 dòng>
Test: <lệnh + kết quả>
Migration: không | có — <mô tả>
Contract: không đổi | đổi <tên> lên <version>, đã báo <TVx>
Expected: không đổi | đổi — <lý do, TV4 đồng ý>
Bất biến: đã kiểm INV-01…13
```
