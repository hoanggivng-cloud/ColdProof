# Data provenance

Luồng dữ liệu chuẩn:

```text
Raw Source → ParsedRecord → Canonical Measurement → Backend Business Enrichment
```

Core canonical measurement thuộc Data Engineering và chỉ mô tả physical measurement, source/parser provenance cùng data-quality state. Mỗi record phải truy được dataset, file, raw reference, checksum SHA-256 và parser/version. `measurement_origin` phân biệt `REAL_PUBLIC_DATA`, `DERIVED` và `SYNTHETIC`.

Normalization chuyển `ParsedTimeSeriesRecord` thành core canonical time-series measurement. Caller phải truyền parser identity và timezone context explicit. Timestamp local-naive không được mặc định thành `Z` hoặc một offset bất kỳ; numeric offset chỉ được gắn khi context đánh dấu nguồn là `SOURCE_DECLARED` hoặc `EXPLICIT_ASSUMPTION`. Context đã áp dụng được trả cùng kết quả để caller giữ audit trail.

`record_id` được tạo deterministic bằng SHA-256 từ source checksum, raw reference, parser id và parser version. Parsed rows thiếu temperature, thiếu sensor provenance, có timestamp/context không hợp lệ hoặc chứa parser warning trả về normalization failure có cấu trúc; normalizer không impute, clamp hoặc silently drop row.

Business enrichment thuộc backend/workflow, bao gồm scenario, batch, segment, business-context origin, profile, thresholds, excursion, exception và review status. Các field này không phải raw source provenance.

- Zenodo được normalize thành `TIMESERIES`; timestamp bắt buộc phải có timezone/offset.
- Mendeley được normalize thành `SPATIAL_SNAPSHOT`; không tạo timestamp, duration hoặc excursion semantics giả.

Không sửa raw source, nội suy missing measurement trong schema/normalization layer hoặc tự động loại bỏ/resolve các record duplicate và conflict. Normalization không phát hiện missing intervals, duplicates, conflicts hay excursions; các bước này thuộc Data Quality và business workflow downstream.
