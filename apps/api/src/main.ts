import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global prefix for all API routes
  app.setGlobalPrefix('api/v1');

  // Enable CORS for frontend development
  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`AI Engineering Workspace API running on http://localhost:${port}/api/v1`);
  logger.log(`Health endpoint available at http://localhost:${port}/api/v1/health`);
}

bootstrap();
