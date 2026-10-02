# Data provenance

Luồng dữ liệu chuẩn:

```text
Raw Source → ParsedRecord → Canonical Measurement → Backend Business Enrichment
```

Core canonical measurement thuộc Data Engineering và chỉ mô tả physical measurement, source/parser provenance cùng data-quality state. Mỗi record phải truy được dataset, file, raw reference, checksum SHA-256 và parser/version. `measurement_origin` phân biệt `REAL_PUBLIC_DATA`, `DERIVED` và `SYNTHETIC`.

Business enrichment thuộc backend/workflow, bao gồm scenario, batch, segment, business-context origin, profile, thresholds, excursion, exception và review status. Các field này không phải raw source provenance.

- Zenodo được normalize thành `TIMESERIES`; timestamp bắt buộc phải có timezone/offset.
- Mendeley được normalize thành `SPATIAL_SNAPSHOT`; không tạo timestamp, duration hoặc excursion semantics giả.

Không sửa raw source, nội suy missing measurement trong schema layer hoặc tự động loại bỏ/resolve các record duplicate và conflict.
