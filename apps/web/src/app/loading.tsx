export default function Loading() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-violet border-t-transparent" />
        <p className="text-xs font-mono text-zinc-400">Loading workspace...</p>
      </div>
    </div>
  );
}

