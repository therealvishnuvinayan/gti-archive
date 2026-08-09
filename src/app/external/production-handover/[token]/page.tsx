import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import { Clock3, FileQuestion, ShieldCheck } from "lucide-react";

import { ProductionHandoverWorkspace } from "@/components/projects/production-handover-workspace";
import { checkExternalRequestRateLimit, getExternalRequestClientIp } from "@/lib/external-request-rate-limit";
import { getExternalProductionHandoverData } from "@/lib/stage-six";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Production Handover | GTI Archive", robots: { index: false, follow: false, nocache: true } };

export default async function ExternalProductionHandoverPage({ params }: { params: Promise<{ token: string }> }) {
  noStore();
  const [{ token }, requestHeaders] = await Promise.all([params, headers()]);
  const limit = checkExternalRequestRateLimit({ token, clientIp: getExternalRequestClientIp(requestHeaders), scope: "verify", limit: 30 });
  const data = limit.allowed ? await getExternalProductionHandoverData(token) : ({ state: "unavailable" } as const);
  return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f7fbf7_0,#edf3ed_52%,#e7eee8_100%)] px-4 py-8 sm:px-6 sm:py-12"><div className="mx-auto w-full max-w-[880px]"><div className="mb-5 flex items-center justify-between px-1"><div><p className="text-[13px] font-[800] uppercase tracking-[.18em] text-[#295f43]">GTI Archive</p><p className="mt-1 text-[11px] text-[#738078]">Secure production handover</p></div><ShieldCheck className="h-7 w-7 text-[#397653]" /></div><section className="overflow-hidden rounded-[26px] border border-[#dce5dd] bg-white shadow-[0_28px_80px_rgba(18,35,23,.1)]">{data.state === "active" ? <ProductionHandoverWorkspace data={data} token={token} /> : <div className="px-6 py-16 text-center">{data.state === "expired" ? <Clock3 className="mx-auto h-9 w-9 text-[#397653]" /> : <FileQuestion className="mx-auto h-9 w-9 text-[#397653]" />}<h1 className="mt-4 text-[26px] font-[780]">{data.state === "expired" ? "Handover link expired" : "Handover unavailable"}</h1><p className="mt-2 text-[13px] text-[#68746c]">{data.state === "expired" ? "Contact the sender for a new secure delivery." : "This link is invalid or is not available."}</p></div>}</section><p className="mt-5 text-center text-[11px] text-[#758179]">Only the explicitly selected handover content is available here.</p></div></main>;
}
