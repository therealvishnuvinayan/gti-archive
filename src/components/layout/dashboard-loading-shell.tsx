function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[22px] bg-white/75 ${className}`} />;
}

export function DashboardLoadingShell() {
  return (
    <div className="h-[100svh] overflow-hidden bg-background p-3 sm:p-4 lg:p-6">
      <div className="mx-auto flex h-full max-w-[1600px] gap-4 lg:gap-5">
        <aside className="hidden h-full w-[306px] rounded-[30px] bg-sidebar px-6 py-7 lg:flex lg:flex-col">
          <SkeletonBlock className="mb-14 h-[78px] w-[176px]" />
          <div className="flex flex-1 flex-col gap-10">
            <div>
              <SkeletonBlock className="mb-4 h-3 w-16 bg-white/55" />
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <SkeletonBlock key={index} className="h-[54px] w-full rounded-2xl" />
                ))}
              </div>
            </div>
            <div>
              <SkeletonBlock className="mb-4 h-3 w-20 bg-white/55" />
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <SkeletonBlock key={index} className="h-[54px] w-full rounded-2xl" />
                ))}
              </div>
            </div>
          </div>
          <SkeletonBlock className="mt-6 h-[54px] w-full rounded-2xl" />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
          <header className="rounded-[30px] bg-surface px-4 py-4 shadow-[0_18px_40px_rgba(23,39,28,0.05)] sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-12 w-12 rounded-2xl lg:hidden" />
                <SkeletonBlock className="h-[52px] w-full max-w-[430px] rounded-full xl:min-w-[350px]" />
              </div>
              <div className="flex items-center gap-3 sm:gap-4">
                <SkeletonBlock className="h-[54px] w-[54px] rounded-full" />
                <SkeletonBlock className="h-[54px] w-[54px] rounded-full" />
                <SkeletonBlock className="h-[72px] min-w-[250px] rounded-full" />
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 rounded-[32px] bg-surface p-5 shadow-[0_24px_80px_rgba(23,39,28,0.06)] sm:p-6 lg:p-8">
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
          </main>
        </div>
      </div>
    </div>
  );
}
