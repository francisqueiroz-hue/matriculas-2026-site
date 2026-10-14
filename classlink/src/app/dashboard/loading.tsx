export default function Carregando() {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">Carregando...</span>
      <div className="h-6 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
      <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-900" />
    </div>
  );
}
