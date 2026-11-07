import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule — Global Database Module
 *
 * What this module does:
 * ----------------------
 * This module registers PrismaService as a globally available provider.
 *
 * Without @Global():
 *   Every feature module that needs the database would have to explicitly import
 *   PrismaModule in its own imports array. With 10+ feature modules planned
 *   (Auth, Orgs, Projects, Tasks, AI, MCP, etc.), this would create repetitive
 *   boilerplate in every module file.
 *
 * With @Global():
 *   PrismaModule is registered once in AppModule. After that, PrismaService is
 *   automatically available for injection in every module across the entire
 *   application — no additional imports needed.
 *
 * Appropriate use of @Global():
 *   @Global() should be used sparingly — only for truly cross-cutting infrastructure
 *   like database connections, logging, and configuration. PrismaService fits this
 *   criterion because database access is required by virtually every feature.
 *
 * Usage in any feature module's service:
 * ----------------------------------------
 * // In organizations.service.ts (no PrismaModule import needed in OrgsModule):
 * @Injectable()
 * export class OrganizationsService {
 *   constructor(private readonly prisma: PrismaService) {}
 *
 *   async findAll(orgId: string) {
 *     return this.prisma.project.findMany({ where: { organizationId: orgId } });
 *   }
 * }
 */
@Global()
@Module({
  // providers: Classes that NestJS creates and manages in this module.
  // PrismaService is instantiated once (singleton) and shared throughout the app.
  providers: [PrismaService],

  // exports: Makes PrismaService injectable in any module that imports PrismaModule.
  // Because of @Global(), you don't need to import PrismaModule anywhere else —
  // but exporting is still required for NestJS's dependency injection to work correctly.
  exports: [PrismaService],
})
export class PrismaModule {}
