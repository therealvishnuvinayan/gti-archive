import { Skeleton } from "@/components/ui/skeleton";

export function DashboardLoadingShell() {
  return (
    <div className="h-[100dvh] overflow-hidden bg-background p-2 sm:p-3 xl:p-4">
      <div className="flex h-full w-full min-w-0 gap-3 xl:gap-4">
        <aside className="hidden h-full w-[280px] rounded-[26px] bg-sidebar px-4 py-5 xl:flex xl:flex-col">
          <Skeleton className="mb-8 h-[76px] w-[166px] self-center rounded-[18px]" />
          <div className="flex flex-1 flex-col gap-8">
            <div>
              <Skeleton className="mb-4 h-3 w-16 rounded-full" />
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-[52px] w-full rounded-[18px]" />
                ))}
              </div>
            </div>
            <div>
              <Skeleton className="mb-4 h-3 w-20 rounded-full" />
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton key={index} className="h-[52px] w-full rounded-[18px]" />
                ))}
              </div>
            </div>
          </div>
          <Skeleton className="mt-3 h-10 w-full rounded-[13px]" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-hidden">
          <header className="flex min-h-14 items-center rounded-[18px] bg-surface px-2.5 py-2 shadow-[0_12px_32px_rgba(23,39,28,0.045)] sm:min-h-16 sm:rounded-[22px] sm:px-4 lg:px-5">
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-[12px] xl:hidden" />
                <Skeleton className="h-9 w-24 rounded-[12px]" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="size-10 rounded-[13px]" />
                <Skeleton className="h-[52px] w-[52px] rounded-[14px] xl:w-[190px]" />
              </div>
            </div>
          </header>

          <main className="min-h-0 min-w-0 flex-1 rounded-[22px] bg-surface p-3 shadow-[0_20px_60px_rgba(23,39,28,0.055)] sm:rounded-[26px] sm:p-4 lg:p-5 xl:p-6">
            <div className="space-y-6">
              <Skeleton className="h-14 w-[280px] rounded-[22px]" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-[152px] w-full rounded-[22px]" />
                ))}
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <Skeleton className="h-[220px] rounded-[22px] xl:col-span-6" />
                <Skeleton className="h-[220px] rounded-[22px] xl:col-span-3" />
                <Skeleton className="h-[220px] rounded-[22px] xl:col-span-3" />
                <Skeleton className="h-[240px] rounded-[22px] xl:col-span-5" />
                <Skeleton className="h-[240px] rounded-[22px] xl:col-span-4" />
                <Skeleton className="h-[240px] rounded-[22px] xl:col-span-3" />
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
