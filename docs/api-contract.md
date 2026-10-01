# API scaffold

Base `/api`, Swagger `/docs`.

- `GET /api/health`: liveness.
- `POST /api/sources`, `GET /api/sources/:id`: đăng ký/đọc source metadata.
- `POST /api/imports`, `GET /api/imports/:id`: tạo/đọc import metadata; chưa dispatch worker.
- `GET /api/{module}/status`: trạng thái TODO của module.

Chưa có authentication/RBAC, upload hoặc xử lý import. Parser IDs dự kiến: format-a/b/c, version 0.1.0.
