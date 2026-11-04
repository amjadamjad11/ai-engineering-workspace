import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealthStatus() {
    return {
      status: 'ok',
      service: 'AI Engineering Workspace API',
      timestamp: new Date().toISOString(),
    };
  }
}
