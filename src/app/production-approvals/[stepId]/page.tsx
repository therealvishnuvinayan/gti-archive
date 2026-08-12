import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileQuestion, ShieldCheck } from "lucide-react";

import { ProductionApprovalWorkspace } from "@/components/projects/production-approval-workspace";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { getAuthenticatedProductionApprovalData } from "@/lib/stage-six";

export const metadata: Metadata = {
  title: "Production Approval | GTI Archive",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AuthenticatedProductionApprovalPage({ params }: { params: Promise<{ stepId: string }> }) {
  const { stepId } = await params;
  const user = await requireUser(`/production-approvals/${stepId}`);
  const data = await getAuthenticatedProductionApprovalData(user, stepId);
  const hasApprovalData =
    data.state === "active" || data.state === "approved" || data.state === "rejected";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f7fbf7_0,#edf3ed_52%,#e7eee8_100%)] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-[880px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <p className="text-[13px] font-[800] uppercase tracking-[.18em] text-[#295f43]">
              GTI Archive
            </p>
            <p className="mt-1 text-[11px] text-[#738078]">Authenticated approval</p>
          </div>
          {hasApprovalData ? (
            <Button
              asChild
              type="button"
              variant="secondary"
              className="rounded-full border border-[#d8e4da] bg-white shadow-none"
            >
              <Link href={`/projects/${data.project.id}/stages/6`}>
                <ArrowLeft className="h-4 w-4" />
                Back to Stage 6
              </Link>
            </Button>
          ) : (
            <ShieldCheck className="h-7 w-7 text-[#397653]" />
          )}
        </div>
        <section className="overflow-hidden rounded-[26px] border border-[#dce5dd] bg-white shadow-[0_28px_80px_rgba(18,35,23,.1)]">
          {hasApprovalData ? (
            <ProductionApprovalWorkspace data={data} access={{ kind: "authenticated" }} />
          ) : (
            <div className="px-6 py-16 text-center">
              <FileQuestion className="mx-auto h-9 w-9 text-[#397653]" />
              <h1 className="mt-4 text-[26px] font-[780]">
                {data.state === "locked" ? "Stage locked" : "Approval unavailable"}
              </h1>
              <p className="mt-2 text-[13px] text-[#68746c]">
                {data.state === "locked"
                  ? "Stage 6 is locked. Complete the preceding workflow stage before opening this approval."
                  : "This approval is not assigned to your account or is not active."}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
