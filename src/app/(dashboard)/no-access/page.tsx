import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { requireUser } from "@/lib/auth";

export default async function NoAccessPage() {
  await requireUser();

  return (
    <DashboardLayout>
      <section className="flex min-h-[60vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-[560px] rounded-[28px] border border-[#e5ece6] bg-white p-8 text-center shadow-[0_18px_42px_rgba(23,39,28,0.05)]">
          <h1 className="text-[32px] font-[700] leading-tight text-[#111712]">
            You do not have access to this area.
          </h1>
          <p className="mt-4 text-[16px] leading-7 text-[#657066]">
            Please contact your administrator if you believe this is a mistake.
          </p>
        </div>
      </section>
    </DashboardLayout>
  );
}
