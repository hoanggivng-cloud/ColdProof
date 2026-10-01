import { Injectable } from '@nestjs/common';
import type { ScaffoldStatus } from '@coldproof/shared-types';
@Injectable()
export class NormalizationService {
  status(): ScaffoldStatus { return { module: 'normalization', status: 'TODO', message: 'Business implementation is not available in foundation.' }; }
}
