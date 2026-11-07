import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_PREFIX: z.string().default('api/v1'),
  CORS_ORIGIN: z.string().default('*'),

  // ---------------------------------------------------------------------------
  // Database (Supabase PostgreSQL via Prisma)
  //
  // DATABASE_URL  — Supabase Supavisor pooled connection (port 6543).
  //                 Used by Prisma Client for all runtime queries (INSERT, SELECT, etc.).
  //                 PgBouncer / Supavisor handles connection pooling so the app does not
  //                 exhaust database connections under load.
  //
  // DIRECT_URL    — Supabase direct connection (port 5432, no connection pooler).
  //                 Used ONLY by the Prisma CLI to create and apply database migrations.
  //                 Migrations require a persistent connection that poolers can interrupt.
  //                 This value is never read at application runtime.
  //
  // Both are marked optional() so the application can start in development without a
  // live Supabase connection (e.g., just testing the health endpoint or Swagger).
  // ---------------------------------------------------------------------------
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),

  // ---------------------------------------------------------------------------
  // Supabase Project Configuration
  // ---------------------------------------------------------------------------
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),

  // ---------------------------------------------------------------------------
  // AI Provider API Keys (all optional — only required for AI-feature routes)
  // ---------------------------------------------------------------------------
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().optional(),
});

// EnvConfig is the TypeScript type inferred from the Zod schema above.
// Anywhere in the codebase you can import EnvConfig for typed access to env vars.
export type EnvConfig = z.infer<typeof envSchema>;

// validateEnv is called by NestJS ConfigModule at startup.
// If any required env variable is missing or in the wrong format, the app refuses
// to start and prints a clear error message — preventing silent misconfiguration bugs.
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');
    throw new Error(`Environment validation failed: ${errorDetails}`);
  }
  return result.data;
}
