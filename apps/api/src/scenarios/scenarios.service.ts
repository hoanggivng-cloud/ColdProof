import { Injectable } from '@nestjs/common';
import type { ScaffoldStatus } from '@coldproof/shared-types';
@Injectable()
export class ScenariosService {
  status(): ScaffoldStatus { return { module: 'scenarios', status: 'TODO', message: 'Business implementation is not available in foundation.' }; }
}
