import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { ArrowLeft, FileQuestion, ShieldCheck } from "lucide-react";

import { ProductionHandoverWorkspace } from "@/components/projects/production-handover-workspace";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getAuthenticatedProductionHandoverData } from "@/lib/stage-six";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Production Handover | GTI Archive",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AuthenticatedProductionHandoverPage({
  params,
}: {
  params: Promise<{ handoverId: string }>;
}) {
  noStore();
  const { handoverId } = await params;
  const user = await requireUser(`/production-handovers/${handoverId}`);
  const data = await getAuthenticatedProductionHandoverData(user, handoverId);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f7fbf7_0,#edf3ed_52%,#e7eee8_100%)] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-[880px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <p className="text-[13px] font-[800] uppercase tracking-[.18em] text-[#295f43]">
              GTI Archive
            </p>
            <p className="mt-1 text-[11px] text-[#738078]">
              Authenticated production handover
            </p>
          </div>
          {data.state === "active" ? (
            <Button
              asChild
              type="button"
              variant="secondary"
              className="rounded-full border border-[#d8e4da] bg-white shadow-none"
            >
              <Link href={`/projects/${encodeURIComponent(data.project.id)}`}>
                <ArrowLeft className="h-4 w-4" />
                Back to project
              </Link>
            </Button>
          ) : (
            <ShieldCheck className="h-7 w-7 text-[#397653]" />
          )}
        </div>
        <section className="overflow-hidden rounded-[26px] border border-[#dce5dd] bg-white shadow-[0_28px_80px_rgba(18,35,23,.1)]">
          {data.state === "active" ? (
            <ProductionHandoverWorkspace
              data={data}
              access={{ kind: "authenticated", handoverId }}
            />
          ) : (
            <div className="px-6 py-16 text-center">
              <FileQuestion className="mx-auto h-9 w-9 text-[#397653]" />
              <h1 className="mt-4 text-[26px] font-[780]">
                Handover unavailable
              </h1>
              <p className="mt-2 text-[13px] text-[#68746c]">
                This handover is not assigned to your account or is no longer
                available.
              </p>
            </div>
          )}
        </section>
        <p className="mt-5 text-center text-[11px] text-[#758179]">
          Only the files and information selected for this handover are
          available here.
        </p>
      </div>
    </main>
  );
}
