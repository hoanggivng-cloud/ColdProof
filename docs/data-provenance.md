# Data provenance

Mỗi measurement phải truy được dataset, file, raw reference, checksum và parser/version. Phân biệt REAL_PUBLIC_DATA, DERIVED và SYNTHETIC; business context có nhãn nguồn riêng. Không sửa raw source, nội suy im lặng hoặc bỏ stream sensor xung đột.

Chưa có dữ liệu trong repository. Source metadata API chưa xác minh bytes/upload; storage retention và transformation log cần triển khai.
