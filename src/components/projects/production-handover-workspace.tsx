import { Download, Eye, FileText, PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ProductionHandoverData } from "@/lib/stage-six";

type ActiveHandover = Extract<ProductionHandoverData, { state: "active" }>;

function valueText(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Not provided";
  const record = value as { text?: unknown; values?: unknown; included?: unknown };
  return [
    typeof record.text === "string" ? record.text : "",
    Array.isArray(record.values) ? record.values.filter((item): item is string => typeof item === "string").join(", ") : "",
    record.included === true ? "Included" : "",
  ].filter(Boolean).join(" · ") || "Not provided";
}

export function ProductionHandoverWorkspace({ data, token }: { data: ActiveHandover; token: string }) {
  const basePath = `/api/external/production-handover/${encodeURIComponent(token)}/files`;
  return <div><header className="border-b border-[#e4ebe5] bg-[linear-gradient(135deg,#f8fbf8,#eef6f0)] px-6 py-7 sm:px-9 sm:py-9"><div className="flex items-center gap-2 text-[11px] font-[780] uppercase tracking-[.13em] text-[#4b765b]"><PackageCheck className="h-4 w-4" /> Production Handover</div><h1 className="mt-2 text-[30px] font-[780] tracking-[-.04em] text-[#172019] sm:text-[38px]">Approved Production Package</h1><p className="mt-2 text-[13px] text-[#68746c]">Secure, time-limited delivery from GTI Archive.</p></header><div className="space-y-6 px-6 py-7 sm:px-9 sm:py-9">
    <dl className="grid gap-3 sm:grid-cols-2">{[["Project", data.project.name], ["Production Unit", data.unit.name], ["Sent By", data.sender], ["Route", data.route === "PURCHASE_DEPARTMENT" ? "Internal" : "External"]].map(([label, value]) => <div key={label} className="rounded-[14px] border border-[#e1e8e2] bg-[#fafcfa] px-4 py-3"><dt className="text-[10px] font-[760] uppercase tracking-[.08em] text-[#7a867e]">{label}</dt><dd className="mt-1 text-[13px] font-[700] text-[#28342c]">{value}</dd></div>)}</dl>
    {data.note ? <section className="rounded-[14px] bg-[#f4f7f4] p-4"><h2 className="text-[10px] font-[760] uppercase tracking-[.08em] text-[#758179]">Handover Note</h2><p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-[#455149]">{data.note}</p></section> : null}
    <section><h2 className="text-[15px] font-[750]">Approved Production Files</h2><div className="mt-3 space-y-3">{data.snapshot.files.map((file) => <div key={file.id} className="flex flex-col gap-3 rounded-[14px] border border-[#e1e8e2] bg-[#fafcfa] p-4 sm:flex-row sm:items-center"><span className="grid size-10 place-items-center rounded-[10px] bg-[#eaf4ed] text-[#347455]"><FileText className="h-5 w-5" /></span><p className="min-w-0 flex-1 truncate text-[12px] font-[720]">{file.name}</p><div className="flex gap-2"><Button asChild type="button" variant="secondary" size="sm"><a href={`${basePath}/${file.id}/preview`} target="_blank" rel="noreferrer"><Eye className="h-3.5 w-3.5" /> Preview</a></Button><Button asChild type="button" variant="secondary" size="sm"><a href={`${basePath}/${file.id}/download`}><Download className="h-3.5 w-3.5" /> Download</a></Button></div></div>)}</div></section>
    {data.snapshot.fields.length ? <section><h2 className="text-[15px] font-[750]">Shared Technical Information</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{data.snapshot.fields.map((field) => <article key={field.key} className="rounded-[14px] border border-[#e1e8e2] bg-[#fafcfa] p-4"><h3 className="text-[10px] font-[760] uppercase tracking-[.07em] text-[#758179]">{field.label}</h3><p className="mt-2 whitespace-pre-wrap text-[12px] leading-5 text-[#455149]">{valueText(field.value)}</p>{field.attachments.length ? <div className="mt-3 flex flex-wrap gap-2">{field.attachments.map((file) => <a key={file.id} href={`${basePath}/${file.id}/download`} className="rounded-full bg-[#eaf4ed] px-2.5 py-1 text-[9px] font-[680] text-[#2e744e]">{file.name}</a>)}</div> : null}</article>)}</div></section> : null}
  </div></div>;
}
