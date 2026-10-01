import { Injectable } from '@nestjs/common';
import type { ScaffoldStatus } from '@coldproof/shared-types';
@Injectable()
export class UsersService {
  status(): ScaffoldStatus { return { module: 'users', status: 'TODO', message: 'Business implementation is not available in foundation.' }; }
}
