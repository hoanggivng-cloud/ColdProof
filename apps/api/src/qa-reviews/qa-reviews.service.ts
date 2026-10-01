import { Injectable } from '@nestjs/common';
import type { ScaffoldStatus } from '@coldproof/shared-types';
@Injectable()
export class QAReviewsService {
  status(): ScaffoldStatus { return { module: 'qa-reviews', status: 'TODO', message: 'Business implementation is not available in foundation.' }; }
}
