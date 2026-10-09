# ColdProof — Quy tắc cho AI agent

Đọc hết file này trước mọi task. Nguồn sự thật là spec v3.2 (`docs/PRD.md`, `docs/SRS.md`; bản gốc: ColdProof_PRD_SRS_SRC_v3_2). Khi file này và spec mâu thuẫn, spec thắng: dừng lại và báo.

Đầu mỗi task, đọc thêm 2 file:
- `agents/roles.md` — mục của owner task (phạm vi, quy tắc riêng, DoD).
- `agents/playbooks.md` — mục ứng với loại việc (parser, endpoint, migration, kịch bản, màn hình).

## 1. Dự án

- Luồng chính: nhập file nhiệt độ nhiều thiết bị/format → chuẩn hóa → gắn vào lô theo khung giờ thiết bị → phát hiện sự cố → QA duyệt → xuất evidence package có provenance.
- MVP dùng dữ liệu bán giả lập: số đo lấy từ Zenodo (observed); lô, chặng, thiết bị, format là mô phỏng (SYNTHETIC).
- Stack: NestJS + TypeScript, PostgreSQL + TimescaleDB, BullMQ + Redis, React + TypeScript + Tailwind, Docker Compose.
- Role: `OPERATOR`, `QA_REVIEWER`, `ADMIN`.

## 2. Lệnh

| Việc | Lệnh |
| --- | --- |
| Cài đặt | `pnpm install` |
| Hạ tầng | `docker compose -f infra/docker-compose.yml up -d` |
| DB | `pnpm db:migrate` · `pnpm db:seed` |
| Chạy dev | `pnpm dev` |
| Kiểm tra | `pnpm lint` · `pnpm typecheck` · `pnpm test` |
| Test riêng | `pnpm test:parser` · `pnpm test:scenario` · `pnpm test:e2e` |

TV4 giữ bảng này khớp với `package.json`. Script đổi thì sửa bảng trong cùng PR.

## 3. Bất biến — không bao giờ vi phạm

| ID | Quy tắc |
| --- | --- |
| INV-01 | Không UPDATE/DELETE `measurements` và `audit_events`; không viết migration cấp lại quyền đó. Sửa dữ liệu = thêm bản ghi transformation mới. |
| INV-02 | Không ghi vào `data/observed/`. Raw file chỉ đọc; checksum không được đổi. |
| INV-03 | Không nội suy dữ liệu thiếu. Khoảng trống → quality issue `MISSING_INTERVAL`. |
| INV-04 | Hai cảm biến lệch nhau → giữ cả hai chuỗi + `SENSOR_CONFLICT`. Không tự chọn chuỗi đúng, không lấy trung bình. |
| INV-05 | Không có code path nào gán lô đạt/không đạt (accepted/rejected). Sự cố chỉ tạo review task; người quyết định. |
| INV-06 | Mọi canonical record có đủ `source_id, source_ref, parser_id, parser_version, import_id, device_id, origin`. Thiếu → reject, không điền mặc định. |
| INV-07 | `measurements` không có `batch_id`/`segment_id`. Bản ghi thuộc leg nào = truy vấn device window `(device_id, start, end)`. |
| INV-08 | Không dịch timestamp gốc để sửa lệch đồng hồ; lưu `clock_offset` trên device window. |
| INV-09 | Không tính thời lượng hay độ liên tục qua ranh giới segment khác nguồn. |
| INV-10 | Dữ liệu mô phỏng luôn có `origin = SYNTHETIC` và hiện nhãn "Mô phỏng" trên UI/report. |
| INV-11 | MKT chỉ là chỉ số bổ trợ, đặt sau danh sách exception; không dùng để kết luận. |
| INV-12 | Không viết vào UI/report/README: "đạt chuẩn GSP/GDP", "chứng nhận", "tích hợp thiết bị thật", "dữ liệu doanh nghiệp/vaccine thật" (spec Mục 30). |
| INV-13 | Không commit secret, token, `.env`, dữ liệu người hoặc doanh nghiệp thật. |

## 4. Owner — chỉ sửa trong phạm vi task

| Owner | Thư mục |
| --- | --- |
| TV1 Data/Parser | `apps/api/src/{sources,imports,adapters,parsers,normalization,data-quality}`, `packages/{canonical-schema,parser-contracts}`, `data/{observed,fixtures,manifests,scenarios,vendor_reference}`, `docs/data-provenance.md` |
| TV2 Backend/Core | `apps/api/src/{scenarios,batches,devices,exceptions}`, `infra/db/migrations` (bảng nghiệp vụ), OpenAPI |
| TV3 Frontend | `apps/web` |
| TV4 Evidence/Platform | `apps/api/src/{auth,users,qa-reviews,reports,audit}`, `tests/{integration,scenario-regression,e2e}`, `data/expected`, `infra/docker-compose.yml`, script release |

- Chỉ sửa file thuộc owner của task. Cần đổi module khác → dừng, ghi rõ cần đổi gì vào PR hoặc issue cho owner đó.
- Contract dùng chung (`canonical-schema`, OpenAPI, EvidencePackage, `scenario-schema`): đổi phải tăng version và owner duyệt.
- `data/expected/` chỉ đổi khi TV4 đồng ý và PR nêu lý do. Không bao giờ sửa expected để test pass.

## 5. Quy trình mỗi task

1. Xác định requirement ID (FR-, NFR-, AC-, TC-). Không có ID → hỏi, không tự đoán phạm vi.
2. Đọc mục spec liên quan và code hiện có của module trước khi sửa.
3. Nêu kế hoạch ngắn: file sẽ sửa, test sẽ thêm. Diff dự kiến hơn ~300 dòng → chia task nhỏ.
4. Viết test cùng code: logic → unit test; parser → parser-contract test + fixture; rule/kịch bản → scenario regression.
5. Chạy lint, typecheck, test của package bị ảnh hưởng. Chỉ báo "xong" khi đã chạy và pass, kèm kết quả.
6. Diff nhỏ; không refactor ngoài phạm vi; không format lại file không liên quan.
7. Thêm dependency → nêu lý do trong PR; ưu tiên thứ repo đã có.

## 6. Quy ước code

- TypeScript strict; không `any`; `@ts-ignore` phải có comment lý do.
- DTO validate bằng `class-validator`. Mã lỗi theo spec Mục 13 (`FORMAT_UNSUPPORTED`, `PARSE_TIMESTAMP_ERROR`, `MISSING_VALUE`, `MISSING_INTERVAL`, `SENSOR_CONFLICT`…). Cần mã mới → thêm vào Mục 13 trước.
- Thời gian lưu `timestamptz` UTC, giữ chuỗi gốc ở `timestamp_raw`; hiển thị theo `Asia/Ho_Chi_Minh`.
- Nhiệt độ lưu `temp_c`; đổi °F → °C phải ghi transformation log và giữ `unit_original`.
- So ngưỡng: vượt khi `< lower` hoặc `> upper`; test cả giá trị bằng đúng ngưỡng.
- Parser mới = 1 module `parsers/format-x/` cài `ParserAdapter` + fixture + parser-contract test; không sửa lõi registry/normalizer.
- Import và sinh report chạy qua BullMQ, không chạy trong request.
- Hash: SHA-256 trên JSON chuẩn hóa (key sắp xếp) và trên file PDF.
- Migration chỉ tiến (forward-only); PR đổi schema kèm migration note.
- Log không chứa dữ liệu nhạy cảm.

## 7. Giao diện (`apps/web`)

- Màn MVP: Đăng nhập, Batch List, Batch Setup, Import Console, Batch Detail, QA Review, Report Preview. Column Mapping là P1; Source Registry, Scenario Library, Admin là P2.
- Frontend không tự tính exception hay trạng thái nghiệp vụ; hiển thị đúng dữ liệu API trả về.
- Ẩn hành động mà role không có quyền; backend vẫn phải chặn.
- Biểu đồ: không nối đường qua khoảng trống dữ liệu; hai chuỗi xung đột vẽ cả hai; đoạn vượt ngưỡng tô đỏ.
- Mỗi màn đủ 4 trạng thái: đang tải, trống, lỗi, có cảnh báo. Mỗi màn chỉ 1 hành động chính.
- Màu (token trong `apps/web/src/app/globals.css`, không hard-code trong component): navy đậm `#0E1E3A` cho thanh trên; nhấn `#1F3A68` (hover `#172E54`) cho nút chính, link, focus; nền `#F5F7FA`, panel `#FFFFFF`; chữ `#14171F`, chữ phụ `#4A5568`, viền `#D9DEE7`. Đỏ `#B42318` chỉ cho vượt ngưỡng/lỗi; hổ phách `#B54708` chỉ cho cảnh báo.
- Font IBM Plex Sans; số, mã lô, thời gian dùng IBM Plex Mono + `tabular-nums`, căn phải trong bảng.
- Cấm: gradient, glassmorphism, bóng đổ lớn, bo góc ≥ 16px, emoji, hero section, biến mọi thứ thành card.
- Chữ giao diện tiếng Việt, ngắn, bắt đầu bằng động từ ("Xuất hồ sơ", "Gán thiết bị").
- Mock data đặt ở `apps/web/src/mocks`, cùng shape với OpenAPI.

## 8. Dừng lại và hỏi khi

- Spec mơ hồ hoặc mâu thuẫn.
- Cần sửa module hoặc contract của owner khác.
- Test expected phải đổi.
- Thay đổi chạm vào bất kỳ bất biến nào ở Mục 3.
- Cần thêm bảng, cột, dependency hoặc dịch vụ ngoài.
- Không chạy được test (thiếu DB, thiếu fixture): báo lại, không bỏ qua test.

## 9. Commit và PR

Commit theo Conventional Commits, kèm requirement ID:
`feat(devices): cảnh báo chồng khung giờ [FR-DEV-002]`

Mô tả PR theo mẫu cuối `agents/playbooks.md`. Trước khi merge, chạy một agent khác ở vai Reviewer (`agents/roles.md`).
