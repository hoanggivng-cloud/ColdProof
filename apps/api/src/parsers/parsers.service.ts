import { Injectable } from '@nestjs/common';
import type { ScaffoldStatus } from '@coldproof/shared-types';
@Injectable()
export class ParsersService {
  status(): ScaffoldStatus { return { module: 'parsers', status: 'TODO', message: 'Business implementation is not available in foundation.' }; }
}
