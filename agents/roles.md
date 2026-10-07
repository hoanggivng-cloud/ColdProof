# Vai trò

Agent làm task của ai thì đọc mục của người đó. Luật chung ở `AGENTS.md`.

| Owner | Requirement | Phải giao cho người khác |
| --- | --- | --- |
| TV1 Data/Parser | FR-SRC, FR-ING-001/003, FR-PAR, FR-NRM, FR-PRV, FR-DQ-001/002/004, FR-SIM | Canonical contract + manifest S01–S04 (tuần 1); format A–D, S05, S07 (tuần 2) |
| TV2 Backend/Core | FR-SCN, FR-BAT, FR-ING-004, FR-DEV, FR-DQ-003, FR-EXC | OpenAPI skeleton (tuần 1), freeze (tuần 2) |
| TV3 Frontend | FR-UI, giao diện cho FR-BAT/DEV/QA/RPT | — |
| TV4 Evidence/Platform | FR-QA, FR-RPT, FR-AUD, FR-SEC, NFR | RBAC guard (tuần 1); EvidencePackage contract (tuần 2); bảng số liệu cho hồ sơ (tuần 4) |

Thư mục của từng owner: `AGENTS.md` Mục 4.

## TV1 — Data/Parser

- Dòng không đọc được → warning kèm `rawRef`; không bỏ im lặng, không ép kiểu.
- Khoảng trống tính theo chu kỳ lấy mẫu của chính thiết bị; dòng trùng → flag, giữ lineage.
- Không gắn batch/segment trong parser hay normalizer.
- Soạn manifest kịch bản và lỗi thiết bị S07; mọi field mô phỏng gắn `SYNTHETIC`.
- **DoD:** 4 format A–D cho cùng canonical; 100% record đủ provenance; checksum raw không đổi.

## TV2 — Backend/Core

- Segment lấy measurement bằng `(device_id, start, end)` qua `device_windows`.
- Gán chồng khung giờ → cảnh báo, lưu cả hai, ghi audit. Lệch đồng hồ → lưu `clock_offset_s`.
- `calibration_due < window.end` → chặn xuất report, trả lý do.
- Ngưỡng lấy từ product profile có version; không hard-code 2–8°C. MKT: ΔH mặc định 83,144 kJ/mol.
- **DoD:** S01 = 0 exception; S02 = 1 excursion; S04 giữ 2 chuỗi; S07 = 1 lô, 3 leg, 3 format; tạo lô + gán thiết bị chạy được.

## TV3 — Frontend

- Màn P0: Đăng nhập, Batch List, Batch Setup, Import Console, Batch Detail, QA Review, Report Preview.
- Không tự tính exception/MKT ở client. Backend chưa xong → mock ở `apps/web/src/mocks`, đúng shape OpenAPI.
- Không sửa backend để "làm UI chạy"; sai dữ liệu → báo owner.
- **DoD:** đi trọn Batch Setup → Import → Batch Detail → QA Review → Report không cần Postman; demo ≤ 5 phút.

## TV4 — Evidence/Platform

- QA review chỉ ghi status, note, corrective action; không đụng measurement.
- Hash SHA-256 trên JSON chuẩn hóa và trên PDF; report có provenance, version, flags, exceptions, MKT, review, disclaimer.
- Test fail do business rule → trả issue cho owner, không tự sửa. Bảng số liệu lấy từ regression, không nhập tay.
- **DoD:** regression S01–S05, S07 + E2E pass; hash ổn định 2 lần chạy; `docker compose up` chạy trên máy sạch; TC-010, TC-014 pass.

## Reviewer — chỉ đọc

Dùng một agent khác với agent đã viết code. Không sửa code, chỉ báo.

Kiểm: (1) vi phạm INV-01…13; (2) file ngoài thư mục owner; (3) đổi contract không tăng version; (4) thiếu test hoặc sửa `data/expected` để pass; (5) lệch FR/AC hoặc làm thừa phạm vi; (6) từ cấm ở INV-12; (7) secret, dữ liệu thật.

Kết quả là bảng `Mức | File:dòng | Vấn đề | Cách sửa`. Mức **Chặn** = vi phạm bất biến, sửa expected, sai owner, lộ secret. Không có gì thì ghi "Không có phát hiện" và liệt kê đã kiểm gì.
