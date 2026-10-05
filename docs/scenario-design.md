# ColdProof Scenario Design

## CP-DEMO Blueprint v1

**Blueprint ID:** `CP-DEMO-BLUEPRINT-001`  
**Version:** `0.1.0`  
**Status:** `DRAFT`

---

## 1. Purpose

Tài liệu này định nghĩa phương pháp xây dựng benchmark bán giả lập
cho ColdProof.

Benchmark không nhằm tái tạo một shipment dược phẩm có thật.

Mục tiêu là kiểm thử khả năng của phần mềm ColdProof trong việc:

- ingest evidence từ nhiều loại dữ liệu,
- normalize về canonical representation,
- tổ chức evidence theo batch/shipment/segment,
- phát hiện data-quality issues,
- áp dụng rule đánh giá nhiệt độ,
- duy trì provenance,
- và tạo evidence package có thể review.

Thiết kế benchmark tuân theo workflow:

Design
→ Evidence Selection
↔ Design Refinement
→ Materialization
→ Validation & Freeze

---

# 2. Benchmark Definition

CP-DEMO-001 được định nghĩa là:

**Semi-Synthetic Software Evidence Benchmark**

Nó bao gồm:

1. Real observed physical measurements
2. Synthetic logistics/business context
3. Explicit evaluation assumptions
4. Derived software findings
5. Vendor-inspired export formats ở phase sau

Benchmark không phải:

- real pharmaceutical shipment,
- regulatory certification dataset,
- commercial datalogger integration validation,
- customer validation dataset.

---

# 3. Core Principle

ColdProof không thay đổi physical evidence để phù hợp với story.

Story phải thích nghi với evidence.

Nếu evidence thật không thể hiện một behavior mong muốn,
scenario design phải được điều chỉnh.

Không được:

- sửa nhiệt độ,
- tạo timestamp giả,
- interpolate missing measurements,
- nối các experimental sources thành một physical journey giả,
- tạo recovery/excursion duration không tồn tại trong source.

---

# 4. Data Layers

Benchmark được chia thành ba lớp chính.

## 4.1 Observed Evidence

Nguồn:

- Zenodo cold-storage-room time series
- Mendeley insulated-box spatial thermal data

Origin:

`REAL_PUBLIC_DATA`

Observed evidence giữ nguyên:

- temperature
- humidity
- source timestamp
- sensor identity
- experimental condition
- coordinates
- source file
- raw row/cell
- checksum

---

## 4.2 Scenario Context

Scenario context được nhóm tạo để kiểm thử workflow logistics.

Origin:

`SYNTHETIC`

Các entity dự kiến:

- scenario
- batch
- shipment
- four logistics segments
- three handovers
- carrier
- custodian
- origin
- destination
- route
- device aliases

Synthetic context không thay đổi ý nghĩa vật lý ban đầu của measurement.

Ví dụ:

Một Zenodo observation được replay trong segment `TRANSPORT`
vẫn phải giữ metadata rằng source environment ban đầu là
cold storage room.

---

## 4.3 Evaluation Specification

Evaluation specification mô tả các giả định và rule được dùng
để đánh giá evidence.

Bao gồm:

- Data Quality policy
- Product profile
- Excursion policy
- Boundary policy
- Expected-result validation procedure

Product profile đầu tiên:

`DEMO_2_8C`

Threshold:

- lower: 2°C
- upper: 8°C

Origin:

`ASSUMPTION`

Profile này chỉ phục vụ kiểm thử software behavior.

Nó không mô tả mục đích ban đầu của Zenodo hoặc Mendeley datasets.

---

# 5. Test Objectives

CP-DEMO-001 phải kiểm thử tối thiểu các behavior sau.

## OBJ-001 — Measurement provenance

Mọi measurement phải truy ngược được đến source asset và raw reference.

Ví dụ:

Canonical Measurement
→ parser/version
→ source file
→ source row/cell
→ source checksum

---

## OBJ-002 — Multi-segment replay

Một synthetic batch và shipment được tổ chức thành bốn segments:

1. `LEG-01 — ORIGIN_STORAGE`
2. `LEG-02 — TRANSPORT`
3. `LEG-03 — TRANSIT`
4. `LEG-04 — DESTINATION_STORAGE`

Các segment labels là synthetic context.

---

## OBJ-003 — Handover workflow

Ba handovers tồn tại giữa bốn segments.

Handover boundary không chứng minh một physical event thực tế
đã diễn ra tại timestamp đó.

---

## OBJ-004 — Temperature evaluation

Observed Zenodo evidence nên có meaningful thermal variation
để kiểm thử demo excursion policy.

Design không quy định trước:

- phải có excursion,
- excursion dài bao nhiêu,
- peak temperature bao nhiêu,
- recovery xảy ra khi nào.

Các kết quả này phải đến từ evidence và policy.

---

## OBJ-005 — Data Quality

Selected evidence phải được đánh giá bằng Data Quality Engine hiện tại.

Baseline policy:

- expected interval: 5 seconds
- tolerance: 0 seconds
- no interpolation

Source missing intervals và replay boundaries là hai khái niệm khác nhau.

Không được coi phần source bị loại khỏi scenario như datalogger missing data.

---

## OBJ-006 — Spatial Context

Mendeley evidence được sử dụng để kiểm thử khả năng lưu trữ,
truy xuất và trình bày spatial thermal evidence.

Mendeley data không được sử dụng để:

- tạo shipment timeline,
- tính excursion duration,
- giải thích nguyên nhân của Zenodo event,
- tạo synthetic timestamp.

---

## OBJ-007 — Multi-format normalization

Ở phase Vendor-Inspired Format,
cùng measurement content đã chọn sẽ được re-encode thành:

- Format A
- Format B
- Format C

Mục tiêu:

các parser phải tạo measurement content tương đương.

Không yêu cầu toàn bộ canonical objects giống byte-for-byte,
vì provenance của mỗi generated source file sẽ khác.

---

# 6. Zenodo Evidence Selection

## Required

Candidate golden interval phải:

- có raw provenance,
- có timestamp liên tục trong interval,
- đủ dài để chia thành bốn synthetic segments,
- không dùng fabricated temperature,
- không chứa unresolved malformed rows.

## Preferred

Ưu tiên:

- một sensor duy nhất,
- 5-second regular sampling,
- không có internal missing interval,
- có meaningful thermal variation,
- có experiment event metadata hỗ trợ,
- có baseline trước biến động,
- có post-event behavior nếu source thực sự thể hiện.

## Not required

Không yêu cầu:

- dữ liệu là pharmaceutical shipment,
- source nằm trên xe vận chuyển,
- toàn interval nằm trong 2–8°C,
- excursion duration định trước.

---

# 7. Replay Model

Mode ưu tiên:

`SINGLE_CONTINUOUS_SOURCE_INTERVAL`

Một continuous Zenodo interval được chia thành bốn synthetic segments.

Ví dụ logic:

t0 → t1 : LEG-01  
t1 → t2 : LEG-02  
t2 → t3 : LEG-03  
t3 → t4 : LEG-04

Interval semantics:

`[start, end)`

Measurement tại boundary chỉ thuộc một segment.

Original timestamp không bị sửa.

Synthetic segment boundary không tự động terminate excursion.

---

# 8. Composite Replay Fallback

Nếu không tìm được một continuous interval phù hợp,
benchmark có thể sử dụng composite replay.

Trong trường hợp đó:

- mỗi source block giữ original timestamps,
- mỗi block có `sequence_index`,
- replay boundary phải được hiển thị rõ,
- không tính duration xuyên các independent blocks,
- không tạo synthetic continuity.

Composite replay chỉ được dùng khi evidence selection chứng minh
single continuous interval không phù hợp.

---

# 9. Mendeley Evidence Model

Mendeley được sử dụng dưới dạng:

`SUPPLEMENTAL_ILLUSTRATIVE_CONTEXT`

Quan hệ ví dụ:

Scenario Segment
→ illustrative spatial condition reference

Relation origin:

`SYNTHETIC`

Quan hệ này không có nghĩa:

- cùng thời điểm,
- cùng hàng hóa,
- cùng physical environment,
- cùng shipment,
- causal relationship.

Mendeley condition chỉ được chọn sau khi hoàn thành
condition crosswalk.

---

# 10. Provenance Categories

ColdProof sử dụng các origin categories:

## REAL_PUBLIC_DATA

Observed values trực tiếp từ public source.

Ví dụ:

- Zenodo temperature
- Zenodo humidity
- Zenodo timestamp
- Mendeley spatial temperature
- Mendeley coordinates

## SYNTHETIC

Context do nhóm tạo.

Ví dụ:

- batch
- shipment
- segment
- handover
- carrier
- route

## ASSUMPTION

Rules hoặc business profiles được dùng để đánh giá.

Ví dụ:

- `DEMO_2_8C`

## DERIVED

Kết quả tính toán.

Ví dụ:

- missing interval
- excursion
- duration
- peak
- requires review

## VENDOR_INSPIRED

Generated export representation dùng để kiểm thử parser.

Không phải real vendor integration.

---

# 11. Derived Finding Lineage

Một derived finding không chỉ cần biết source measurement.

Nó phải lưu rule dependency.

Ví dụ:

Excursion
→ input measurement IDs
→ product profile
→ profile origin
→ algorithm version
→ boundary policy
→ gap policy

Do đó:

REAL measurement
+
ASSUMPTION
+
algorithm
=
DERIVED finding

Nguồn thật của measurement không biến assumption thành source fact.

---

# 12. Validation Invariants

Trước khi Scenario Pack được freeze:

1. Observed temperature phải giữ nguyên.
2. Observed humidity phải giữ nguyên.
3. Source timestamps phải giữ nguyên.
4. Source file/row/cell lineage phải truy được.
5. Synthetic mappings phải có origin.
6. Không được fill missing measurement bằng synthetic value.
7. Không được tính duration qua independent replay boundary.
8. Mendeley không được có synthetic timestamp.
9. Mendeley không tham gia excursion duration.
10. DEMO_2_8C luôn được đánh dấu ASSUMPTION.
11. Derived findings phải reference measurements và policy version.
12. Vendor-inspired formats không được mô tả như real commercial integrations.
13. Zenodo measurement được replay thành TRANSPORT vẫn giữ original source environment.

---

# 13. Evidence Must Be Allowed to Refine Design

Evidence Selection có quyền làm thay đổi Scenario Design.

Ví dụ:

Nếu source thể hiện:

stable
→ temperature rise
→ no clear recovery

thì scenario không được gọi là:

stable
→ excursion
→ recovery

Story phải đổi thành:

stable
→ thermal variation
→ review state

Nguyên tắc:

**Evidence decides what the benchmark can truthfully demonstrate.**

---

# 14. Pending Decisions

Blueprint hiện chưa quyết định:

- Zenodo sensor nào được chọn,
- exact start/end timestamp,
- exact segment boundaries,
- Mendeley conditions nào được chọn,
- exact excursion duration semantics,
- behavior tại đúng 2°C và 8°C,
- maximum gap cho phép trong một excursion,
- independent oracle method.

Các quyết định này thuộc Evidence Selection và Design Refinement.

---

# 15. Next Phase

Phase tiếp theo:

## Evidence Selection v1

Deliverables:

### `condition-crosswalk.csv`

Đối chiếu:

C01–C13
→ workbook metadata
→ experimental configuration
→ external/document references
→ verification status

### `candidate-zenodo-windows.csv`

Profiling các candidate intervals:

- sensor
- start
- end
- duration
- count
- min
- max
- mean
- variation
- gaps
- relevant experiment events
- selection rationale

### `evidence-selection-report.md`

Giải thích:

- candidate nào được xem xét,
- candidate nào bị loại,
- vì sao,
- liệu blueprint có cần refinement hay không.

---

# 16. Freeze Policy

Blueprint chưa phải Scenario Pack.

Lifecycle:

DRAFT
→ EVIDENCE_SELECTED
→ MATERIALIZED
→ VALIDATED
→ FROZEN

Chỉ Scenario Pack ở trạng thái `FROZEN`
mới được sử dụng làm regression benchmark chính thức.