import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { setupSwagger } from './config/swagger.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 4000);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');

  // Set the standard API prefix
  app.setGlobalPrefix(apiPrefix);

  // Enable CORS for frontend integration
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
    credentials: true,
  });

  // Global validation pipe for strict DTO payload validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter for standardized error envelopes
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response transformer for standard ApiResponse envelopes
  app.useGlobalInterceptors(new TransformResponseInterceptor());

  // OpenAPI / Swagger documentation setup
  setupSwagger(app, apiPrefix);

  await app.listen(port, '0.0.0.0');

  logger.log(`=================================================================`);
  logger.log(` AI Engineering Workspace API is live on http://localhost:${port}/${apiPrefix}`);
  logger.log(` Swagger API Documentation: http://localhost:${port}/api/docs`);
  logger.log(` Health Check Endpoint:     http://localhost:${port}/${apiPrefix}/health`);
  logger.log(`=================================================================`);
}

bootstrap();
