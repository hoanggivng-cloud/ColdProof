import { Injectable } from '@nestjs/common';
import type { ScaffoldStatus } from '@coldproof/shared-types';
@Injectable()
export class AdaptersService {
  status(): ScaffoldStatus { return { module: 'adapters', status: 'TODO', message: 'Business implementation is not available in foundation.' }; }
}
