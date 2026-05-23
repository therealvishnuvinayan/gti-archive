import { Skeleton } from "@/components/ui/skeleton";

export function DashboardContentLoading() {
  return (
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
  );
}
