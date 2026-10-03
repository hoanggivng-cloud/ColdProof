import { Injectable } from '@nestjs/common';

@Injectable()
export class ExceptionsService {
  
  findAll() {
    // Trả về Mock Data danh sách ngoại lệ
    return [
      { id: 'EX-001', segment_id: 'LEG-01', type: 'HIGH_TEMP', status: 'PENDING' }
    ];
  }

  findOne(id: string) {
    // Trả về Mock Data chi tiết 1 ngoại lệ
    return {
      id: id,
      segment_id: 'LEG-01',
      type: 'HIGH_TEMP',
      status: 'PENDING'
    };
  }

  status() {
    // Trả về Mock Data cho trạng thái quét ngoại lệ
    return {
      status: 'RUNNING',
      total_scanned: 150,
      pending_reviews: 1,
      last_run: new Date().toISOString()
    };
  }

  review(id: string, dto: any) {
    // Trả về Mock Data mô phỏng thao tác QA duyệt ngoại lệ
    return {
      message: 'Review submitted successfully',
      exception_id: id,
      status: 'REVIEWED'
    };
  }
}