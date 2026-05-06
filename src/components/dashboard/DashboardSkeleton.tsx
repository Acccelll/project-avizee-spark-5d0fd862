import { Skeleton } from '@/components/ui/skeleton';

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Dashboard header */}
      <div className="mb-6">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-72 mt-2" />
      </div>

      {/* Greeting bar */}
      <div className="rounded-lg border border-border/60 bg-muted/10 px-4 py-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-72 mt-1.5" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
            <div className="flex justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-7 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-11 w-11 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Operational cards */}
      <div>
        <Skeleton className="h-3 w-40 mb-2" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-3 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Alert strip */}
      <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-32 rounded-full" />
          ))}
        </div>
      </div>

      {/* Financeiro + Quick actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-5 space-y-4">
          <div className="flex justify-between">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-7 w-24" />
          </div>
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
          <Skeleton className="min-h-[220px] w-full" />
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <Skeleton className="h-5 w-28" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </div>
      </div>

      {/* Comercial + Estoque */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
            <Skeleton className="h-5 w-28" />
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-12" />
                </div>
              ))}
            </div>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex justify-between">
                <Skeleton className="h-4 flex-1 mr-4" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Logística + Fiscal */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
            <Skeleton className="h-5 w-28" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-12" />
                </div>
              ))}
            </div>
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-12 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
