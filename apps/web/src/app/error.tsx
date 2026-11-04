"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected client error
    console.error("Workspace Application Error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-md rounded-xl border border-border-subtle bg-canvas-elevated p-6 shadow-2xl">
        <div className="flex items-center gap-3 text-brand-rose">
          <AlertTriangle className="h-6 w-6" />
          <h2 className="text-lg font-semibold text-zinc-100">Something went wrong</h2>
        </div>
        <p className="mt-3 text-sm text-zinc-400">
          An unexpected error occurred in the workspace. Our telemetry has captured the incident.
        </p>
        {error.message && (
          <div className="mt-3 rounded-lg border border-border-subtle bg-canvas-well p-3 font-mono text-xs text-brand-rose/90 break-words">
            {error.message}
          </div>
        )}
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => reset()}
            className="flex items-center gap-2 rounded-lg bg-brand-violet px-4 py-2 text-xs font-medium text-white transition hover:bg-brand-violet/90 focus:outline-none focus:ring-2 focus:ring-brand-violet/40"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

