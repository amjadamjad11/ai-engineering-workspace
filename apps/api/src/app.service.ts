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

  echoPing(message: string) {
    return {
      echo: message,
      receivedAt: new Date().toISOString(),
    };
  }
}
