import { Injectable } from '@nestjs/common';

import { MendeleyParser } from './mendeley-parser';

export { MendeleyWorkbookError } from './mendeley-parser';

/** NestJS provider wrapper; parsing behavior lives in the pure parser. */
@Injectable()
export class MendeleyAdapter extends MendeleyParser {}
