import { Skeleton } from "@/components/ui/skeleton";

export default function TasksLoading() {
  return (
    <div className="mx-auto w-full max-w-[1280px] animate-pulse space-y-5 pb-8">
      <Skeleton className="h-[180px] rounded-[25px]" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[104px] rounded-[19px]" />
        ))}
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-12 flex-1 rounded-[14px]" />
        <Skeleton className="h-12 w-[340px] rounded-[14px]" />
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-[86px] rounded-[21px]" />
      ))}
    </div>
  );
}
