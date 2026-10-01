import { Controller, Get } from '@nestjs/common';
@Controller('health')
export class HealthController {
  @Get() health() { return { status: 'ok', scope: 'foundation', readiness: 'not-checked' }; }
}
