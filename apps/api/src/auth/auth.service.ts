import { Injectable } from '@nestjs/common';
import type { ScaffoldStatus } from '@coldproof/shared-types';
@Injectable()
export class AuthService {
  status(): ScaffoldStatus { return { module: 'auth', status: 'TODO', message: 'Business implementation is not available in foundation.' }; }
}
