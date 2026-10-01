import { Injectable } from '@nestjs/common';
import type { ScaffoldStatus } from '@coldproof/shared-types';
@Injectable()
export class ReportsService {
  status(): ScaffoldStatus { return { module: 'reports', status: 'TODO', message: 'Business implementation is not available in foundation.' }; }
}
