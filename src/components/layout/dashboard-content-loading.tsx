import { Skeleton } from "@/components/ui/skeleton";

export function DashboardContentLoading() {
  return (
    <div className="space-y-6">
      <div className="flex min-w-0 flex-col gap-4 min-[1100px]:flex-row min-[1100px]:items-center min-[1100px]:justify-between">
        <Skeleton className="h-14 w-[280px] rounded-[22px]" />
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Skeleton className="h-[54px] w-[168px] rounded-full" />
          <Skeleton className="h-[54px] w-[180px] rounded-full" />
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-[184px] w-full rounded-[24px]" />
        ))}
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <article
            key={index}
            className="flex min-h-[300px] min-w-0 flex-col rounded-[24px] bg-card p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)] sm:p-6"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-36 rounded-full" />
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-hidden">
              <Skeleton className="h-12 w-full rounded-[18px]" />
              <Skeleton className="h-12 w-full rounded-[18px]" />
              <Skeleton className="h-12 w-4/5 rounded-[18px]" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
