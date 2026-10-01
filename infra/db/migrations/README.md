# Migrations

Schema và migration thực thi nằm tại `apps/api/prisma`. Chạy `pnpm db:migrate` từ root; không lưu bản SQL trùng ở đây.

TimescaleDB có thể bổ sung bằng migration riêng sau này. Cần xử lý timestamp nullable và unique key trước khi chuyển measurements thành hypertable; spatial snapshots vẫn lưu riêng.
