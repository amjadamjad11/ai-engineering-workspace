import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication, apiPrefix: string): void {
  const config = new DocumentBuilder()
    .setTitle('AI Engineering Workspace API')
    .setDescription(
      'Enterprise backend API for collaborative software engineering, permission-aware RAG, and AI agent orchestration.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your Supabase session JWT token',
        in: 'header',
      },
      'access-token',
    )
    .addTag('Health', 'System telemetry, operational readiness, and health checks')
    .addTag('Authentication', 'Session verification and developer profile management')
    .addTag('Organizations', 'Multi-tenant organization lifecycle and member rosters')
    .addTag('Projects', 'Engineering workspaces, settings, documents, and milestones')
    .addTag('Tasks', 'Task management, DAG dependencies, and collaborative comments')
    .addTag('AI & RAG', 'Permission-aware project memory, vector retrieval, and LLM synthesis')
    .addTag('Agents', 'Specialized AI personas, execution traces, and human approvals')
    .addTag('MCP', 'Model Context Protocol endpoints for IDE clients and external agents')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
    customSiteTitle: 'AI Engineering Workspace API Docs',
  });
}
