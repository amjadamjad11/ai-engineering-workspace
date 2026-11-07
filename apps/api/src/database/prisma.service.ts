import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — Database Connection Manager
 *
 * What this class does:
 * --------------------
 * This service wraps Prisma Client with NestJS lifecycle management. By extending
 * PrismaClient, PrismaService IS a Prisma client — meaning you can call all Prisma
 * methods directly on an injected PrismaService (e.g., prismaService.profile.findMany()).
 *
 * Why extend instead of contain PrismaClient?
 * -------------------------------------------
 * Extending means every module that injects PrismaService gets direct access to ALL
 * Prisma models (profile, organization, project, task, etc.) without needing an extra
 * property accessor. The syntax stays clean: `this.prisma.profile.findMany()` instead
 * of `this.prisma.client.profile.findMany()`.
 *
 * Why @Global() on PrismaModule (not here)?
 * -----------------------------------------
 * The @Global() decorator is on PrismaModule, which means this service is available
 * everywhere in the application WITHOUT needing to import PrismaModule in every module.
 * Any NestJS module can inject PrismaService just by declaring it in its constructor.
 *
 * Database Connection Strategy:
 * -----------------------------
 * When DATABASE_URL is not set (e.g., during early development when testing health
 * and Swagger), the service logs a clear warning but does NOT crash the application.
 * This allows the backend to run in "no-database mode" for UI/API testing purposes.
 *
 * When DATABASE_URL IS set, the service connects eagerly on startup so that:
 *   1. The app fails fast if the DB is unreachable at boot time (not on first user request).
 *   2. The first user request isn't delayed by connection setup.
 *
 * Lifecycle:
 * ----------
 * onModuleInit()    — called by NestJS when the app boots. Opens the DB connection.
 * onModuleDestroy() — called by NestJS on graceful shutdown. Closes the DB connection.
 *                     This prevents connection leaks when the server restarts or exits.
 *
 * Query Logging:
 * --------------
 * We configure Prisma to emit three types of logs:
 *   - 'query' (event): Every SQL query Prisma executes, emitted as a Node.js event.
 *                      In development, we listen to this event and log it via NestJS Logger.
 *                      In production, we can disable this or pipe it to a monitoring service.
 *   - 'error' (stdout): Database errors printed directly to stdout.
 *   - 'warn'  (stdout): Database warnings printed directly to stdout.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // NestJS Logger: logs messages prefixed with 'PrismaService' — makes it easy to find
  // DB connection messages in your terminal alongside other NestJS log output.
  private readonly logger = new Logger(PrismaService.name);

  // Track whether we have an active database connection.
  // This is used by health checks to report DB connectivity status honestly.
  private isConnected = false;

  constructor() {
    // Call PrismaClient constructor with our logging configuration.
    // 'emit: event' means Prisma fires a Node.js event we can listen to.
    // 'emit: stdout' means Prisma prints directly to the terminal.
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  /**
   * onModuleInit — called automatically by NestJS when the application module
   * finishes loading (before the HTTP server starts accepting requests).
   *
   * $connect() opens the connection to the database.
   *
   * Graceful degradation: When DATABASE_URL is not configured (early development),
   * we log a clear warning and allow the app to continue. Database-dependent routes
   * will fail naturally when they attempt queries. This prevents a hard crash just
   * because credentials aren't set up yet.
   */
  async onModuleInit(): Promise<void> {
    // Check whether DATABASE_URL is configured before attempting connection.
    // We read process.env directly because ConfigService may not be fully
    // initialized at the time NestJS calls onModuleInit lifecycle hooks.
    if (!process.env.DATABASE_URL) {
      this.logger.warn(
        'DATABASE_URL is not set. PrismaService will start without a database connection. ' +
          'Set DATABASE_URL in apps/api/.env to enable database features.',
      );
      return; // Allow app to boot — health endpoint and Swagger still work.
    }

    // In development mode only, subscribe to query events and log every SQL statement.
    // This is extremely useful for debugging — you can see exactly what Prisma generates.
    if (process.env.NODE_ENV !== 'production') {
      // '$on' is a Prisma method that listens to emitted events.
      // The 'query' event provides the raw SQL, parameters, and execution duration.
      (this as any).$on('query', (event: any) => {
        this.logger.debug(
          `Query: ${event.query} | Params: ${event.params} | Duration: ${event.duration}ms`,
          'PrismaQuery',
        );
      });
    }

    try {
      // Open the database connection pool.
      await this.$connect();
      this.isConnected = true;
      this.logger.log('Database connection established successfully.');
    } catch (error) {
      // Log the error clearly but do NOT re-throw it, so NestJS continues booting.
      // The error will be encountered naturally when routes attempt DB queries.
      this.logger.error(
        `Failed to connect to database: ${(error as Error).message}. ` +
          'Verify DATABASE_URL in apps/api/.env and ensure Supabase is reachable.',
      );
    }
  }

  /**
   * onModuleDestroy — called automatically by NestJS during graceful shutdown
   * (e.g., when you press Ctrl+C or when a deployment replaces the process).
   *
   * $disconnect() closes all open database connections cleanly.
   * Without this, the process might exit with lingering connections, which can:
   *   - Exhaust connection pool limits on Supabase
   *   - Cause "too many clients" errors
   *   - Leave transactions in an indeterminate state
   */
  async onModuleDestroy(): Promise<void> {
    if (this.isConnected) {
      await this.$disconnect();
      this.logger.log('Database connection closed.');
    }
  }

  /**
   * isDatabaseConnected — utility method for health check endpoint.
   * Returns true if the database connection was established successfully.
   */
  get isDatabaseConnected(): boolean {
    return this.isConnected;
  }
}
