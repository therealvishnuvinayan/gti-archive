function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[22px] bg-white/75 ${className}`} />;
}

export function DashboardContentLoading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-14 w-[280px]" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-[152px] w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <SkeletonBlock className="h-[220px] xl:col-span-6" />
        <SkeletonBlock className="h-[220px] xl:col-span-3" />
        <SkeletonBlock className="h-[220px] xl:col-span-3" />
        <SkeletonBlock className="h-[240px] xl:col-span-5" />
        <SkeletonBlock className="h-[240px] xl:col-span-4" />
        <SkeletonBlock className="h-[240px] xl:col-span-3" />
      </div>
    </div>
  );
}
