import { Injectable } from '@nestjs/common';
import type { ScaffoldStatus } from '@coldproof/shared-types';
@Injectable()
export class DataQualityService {
  status(): ScaffoldStatus { return { module: 'data-quality', status: 'TODO', message: 'Business implementation is not available in foundation.' }; }
}
