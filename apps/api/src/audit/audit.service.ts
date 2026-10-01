import { Injectable } from '@nestjs/common';
import type { ScaffoldStatus } from '@coldproof/shared-types';
@Injectable()
export class AuditService {
  status(): ScaffoldStatus { return { module: 'audit', status: 'TODO', message: 'Business implementation is not available in foundation.' }; }
}
