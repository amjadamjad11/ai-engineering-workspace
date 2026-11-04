import { Injectable } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';

@Injectable()
export class AppService {
  // Inject PrismaService so the health endpoint can report real DB connection status.
  // PrismaService is globally available (via @Global() PrismaModule) so no extra
  // import is needed in AppModule — it was already registered there.
  constructor(private readonly prisma: PrismaService) {}

  getHealthStatus() {
    return {
      status: 'ok',
      service: 'AI Engineering Workspace API',
      version: '1.0.0',
      // Report whether a live database connection is established.
      // 'false' here simply means DATABASE_URL is not configured yet — not an error.
      database: this.prisma.isDatabaseConnected ? 'connected' : 'not configured',
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
