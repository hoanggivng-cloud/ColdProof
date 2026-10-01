import { Injectable } from '@nestjs/common';
import type { ScaffoldStatus } from '@coldproof/shared-types';
@Injectable()
export class BatchesService {
  status(): ScaffoldStatus { return { module: 'batches', status: 'TODO', message: 'Business implementation is not available in foundation.' }; }
}
