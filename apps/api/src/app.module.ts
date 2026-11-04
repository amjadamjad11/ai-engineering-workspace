import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';

/**
 * AppModule — Root Application Module
 *
 * This is the top-level module that NestJS uses to bootstrap the entire application.
 * Every feature module, infrastructure module, and global configuration is registered here.
 *
 * Module registration order:
 * --------------------------
 * 1. ConfigModule  — Must be first. It loads and validates environment variables,
 *                    making them available to ALL other modules via ConfigService.
 *                    isGlobal: true means every module can inject ConfigService without
 *                    importing ConfigModule themselves.
 *
 * 2. PrismaModule  — Registered second (after config) because PrismaService reads
 *                    DATABASE_URL from the environment. The @Global() decorator on
 *                    PrismaModule makes PrismaService available everywhere without
 *                    additional imports in feature modules.
 *
 * Future modules will be added here as we implement each phase:
 *   Phase 3: AuthModule
 *   Phase 4: OrganizationsModule, ProjectsModule
 *   Phase 5: TasksModule, ConversationsModule
 *   Phase 6+: AiModule, AgentsModule, McpModule, GithubModule
 */
@Module({
  imports: [
    // ConfigModule: Loads .env file, validates all variables against our Zod schema.
    // If any required variable is missing or invalid, the application refuses to start.
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env', '.env.local'],
    }),

    // PrismaModule: Establishes and manages the PostgreSQL database connection.
    // @Global() on PrismaModule means PrismaService is injectable application-wide.
    PrismaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
