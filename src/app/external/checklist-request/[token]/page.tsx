import type { Metadata } from "next";
import { headers } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { CheckCircle2, Clock3, FileQuestion, ShieldCheck } from "lucide-react";

import { StageFiveExternalRequestWorkspace } from "@/components/projects/stage-five-external-request-workspace";
import {
  checkExternalRequestRateLimit,
  getExternalRequestClientIp,
} from "@/lib/external-request-rate-limit";
import { getExternalChecklistRequestData } from "@/lib/stage-five-external";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Information Request | GTI Archive",
  robots: { index: false, follow: false, nocache: true },
};

function ExternalPageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f7fbf7_0,#edf3ed_52%,#e7eee8_100%)] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-[880px]">
        <div className="mb-5 flex items-center justify-between gap-4 px-1">
          <div>
            <p className="text-[13px] font-[800] uppercase tracking-[0.18em] text-[#295f43]">GTI Archive</p>
            <p className="mt-1 text-[11px] text-[#738078]">Secure information request</p>
          </div>
          <ShieldCheck className="h-7 w-7 text-[#397653]" aria-hidden="true" />
        </div>
        <section className="overflow-hidden rounded-[26px] border border-[#dce5dd] bg-white shadow-[0_28px_80px_rgba(18,35,23,0.1)]">
          {children}
        </section>
        <p className="mt-5 text-center text-[11px] leading-5 text-[#758179]">
          This secure page is limited to this information request.
        </p>
      </div>
    </main>
  );
}

function TerminalState({
  icon,
  title,
  message,
  details,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  details?: Array<[string, string]>;
}) {
  return (
    <div className="px-6 py-14 text-center sm:px-10 sm:py-20">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#edf5ee] text-[#34704f]">{icon}</span>
      <h1 className="mt-5 text-[29px] font-[780] tracking-[-0.04em] text-[#172019]">{title}</h1>
      <p className="mx-auto mt-3 max-w-[520px] text-[14px] leading-6 text-[#68746c]">{message}</p>
      {details?.length ? (
        <dl className="mx-auto mt-7 grid max-w-[560px] gap-3 text-left sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label} className="rounded-[14px] border border-[#e1e8e2] bg-[#fafcfa] px-4 py-3">
              <dt className="text-[10px] font-[760] uppercase tracking-[0.08em] text-[#7a867e]">{label}</dt>
              <dd className="mt-1 text-[13px] font-[700] text-[#28342c]">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

export default async function ExternalChecklistRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  noStore();
  const [{ token }, requestHeaders] = await Promise.all([params, headers()]);
  const rateLimit = checkExternalRequestRateLimit({
    token,
    clientIp: getExternalRequestClientIp(requestHeaders),
    scope: "verify",
    limit: 30,
  });
  const data = rateLimit.allowed
    ? await getExternalChecklistRequestData(token)
    : ({ state: "unavailable" } as const);

  if (data.state === "completed") {
    return (
      <ExternalPageShell>
        <TerminalState
          icon={<CheckCircle2 className="h-7 w-7" />}
          title="Thank you"
          message="Your information has been submitted successfully."
          details={[
            ["Project", data.projectName],
            ["Requested information", data.fieldLabel],
          ]}
        />
      </ExternalPageShell>
    );
  }
  if (data.state === "expired") {
    return (
      <ExternalPageShell>
        <TerminalState
          icon={<Clock3 className="h-7 w-7" />}
          title="This request link has expired"
          message="Please contact the person who sent the request and ask them to resend a new secure link."
        />
      </ExternalPageShell>
    );
  }
  if (data.state === "declined") {
    return (
      <ExternalPageShell>
        <TerminalState
          icon={<CheckCircle2 className="h-7 w-7" />}
          title="Response recorded"
          message="The requester has been notified that this information cannot be provided."
          details={[
            ["Project", data.projectName],
            ["Requested information", data.fieldLabel],
          ]}
        />
      </ExternalPageShell>
    );
  }
  if (data.state !== "active") {
    return (
      <ExternalPageShell>
        <TerminalState
          icon={<FileQuestion className="h-7 w-7" />}
          title="Request unavailable"
          message="This secure request link is invalid or is no longer active."
        />
      </ExternalPageShell>
    );
  }

  return (
    <ExternalPageShell>
      <header className="border-b border-[#e4ebe5] bg-[linear-gradient(135deg,#f8fbf8,#eef6f0)] px-6 py-7 sm:px-9 sm:py-9">
        <p className="text-[11px] font-[780] uppercase tracking-[0.13em] text-[#4b765b]">Stage 5</p>
        <h1 className="mt-2 text-[30px] font-[780] tracking-[-0.04em] text-[#172019] sm:text-[38px]">Information Request</h1>
        <p className="mt-2 max-w-[620px] text-[14px] leading-6 text-[#68746c]">
          Review the requested item and provide the information securely below.
        </p>
      </header>
      <div className="px-6 py-7 sm:px-9 sm:py-9">
        <StageFiveExternalRequestWorkspace token={token} data={data} />
      </div>
    </ExternalPageShell>
  );
}
