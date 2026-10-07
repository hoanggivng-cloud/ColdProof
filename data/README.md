# Dữ liệu

`data/observed/` chứa các source công khai đã quan sát (observed public sources) dùng bởi ColdProof. Full dataset không được commit vào Git; chỉ [`manifests/source_manifest.csv`](manifests/source_manifest.csv) được commit để cố định identity của từng source asset bằng SHA-256 và kích thước byte.

## Observed Data Freeze v1

- **Zenodo raw** (`zenodo/raw/`): runtime time-series source từ chín sensor.
- **Zenodo preprocessed** (`zenodo/preprocessed/`): bản tham chiếu đã được tác giả dataset preprocess.
- **Zenodo metadata** (`zenodo/metadata/`): overview, experiment actions và các notebook do tác giả cung cấp.
- **Mendeley conditions** (`mendeley/conditions/`): observed spatial/thermal condition data cho C01–C13.
- **Mendeley metadata** (`mendeley/metadata/`): tài liệu mô tả điều kiện thí nghiệm.

SHA-256 trong manifest là identity của frozen source v1 và được tính trực tiếp từ byte gốc. Không sửa raw/preprocessed public source tại chỗ. Mọi cleaning, normalization hoặc transformation sau này phải ghi ra derived/canonical data riêng và giữ provenance về source gốc.

## Cài đặt và xác minh

Full source files phải được tải từ các nguồn chính thức sau và đặt đúng `relative_path` trong manifest:

- Zenodo — *Temperature and Humidity Time Series of Cold Storage Room Monitoring*, DOI `10.5281/zenodo.15130001`, version `v1`: <https://doi.org/10.5281/zenodo.15130001>
- Mendeley Data — *Average temperature in an insulated box*, dataset `sz5dgkz7k8`, version `1`: <https://data.mendeley.com/datasets/sz5dgkz7k8/1>

Không dùng mirror không rõ nguồn. Setup tạo directory structure cần thiết, kiểm tra các source đã được đặt vào đúng vị trí, rồi chạy verification khi đủ file:

```sh
pnpm data:setup
```

Xác minh độc lập file size và SHA-256 mà không sửa source hay tự cập nhật manifest:

```sh
pnpm data:verify
```
