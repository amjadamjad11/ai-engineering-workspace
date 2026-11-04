import { HealthCheckClient } from "./health-check-client";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-canvas p-6 md:p-12">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <header className="mb-8 border-b border-border-subtle pb-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-violet/30 bg-brand-violet/10 px-3 py-1 text-xs font-medium text-brand-violet">
                Phase 1 Foundation Ready
              </div>
              <h1 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight text-white">
                AI Engineering Workspace
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                ONE WORKSPACE. EVERY DEVELOPER. ONE SHARED AI BRAIN.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-md border border-border-subtle bg-canvas-elevated px-3 py-1.5 font-mono text-xs text-zinc-300">
                apps/web @ 1.0.0
              </span>
            </div>
          </div>
        </header>

        {/* Dynamic Health & Connectivity Status Component */}
        <HealthCheckClient />
      </div>
    </main>
  );
}

