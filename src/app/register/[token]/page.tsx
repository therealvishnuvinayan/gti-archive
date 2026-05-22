import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { completeRegistrationAction } from "@/app/register/[token]/actions";
import { RegisterForm } from "@/components/auth/register-form";
import { getCurrentUser } from "@/lib/auth";
import { getInviteRegistration } from "@/lib/collaboration";

type RegisterPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function RegisterPage({ params }: RegisterPageProps) {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  const { token } = await params;
  const invite = await getInviteRegistration(token);

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#eef4eb_0%,#edf2ec_30%,#e3e9df_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1080px] items-center">
        <div className="grid w-full overflow-hidden rounded-[28px] border border-[#d4ddd1] bg-white shadow-[0_30px_90px_rgba(29,50,37,0.14)] lg:grid-cols-[0.86fr_1.14fr]">
          <section className="relative flex min-h-[520px] flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,#2f8d5d_0%,#175138_62%,#103727_100%)] px-8 py-10 text-white sm:px-10 sm:py-12">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-[-14%] top-[-8%] h-[300px] w-[300px] rounded-full bg-white/6 blur-2xl" />
              <div className="absolute bottom-[-22%] right-[-10%] h-[320px] w-[320px] rounded-full border-[28px] border-white/8" />
            </div>

            <div className="relative">
              <Image
                src="/gti-logo.svg"
                alt="GTI logo"
                width={250}
                height={112}
                priority
                className="h-auto w-[220px]"
              />
            </div>

            <div className="relative space-y-6">
              <div className="space-y-4">
                <h2 className="max-w-[320px] text-[52px] font-[600] leading-[0.98] tracking-[-0.05em]">
                  Collaborator access
                </h2>
                <p className="max-w-[340px] text-[17px] leading-8 text-white/88">
                  Activate your invitation and set a secure password to enter the GTI Archive portal.
                </p>
              </div>

              <p className="text-[14px] leading-7 text-white/82">
                © 2025 Gulbahar Tobacco Int&apos;l FZE.
                <br />
                All rights reserved.
              </p>
            </div>
          </section>

          <section className="bg-white px-7 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
            <div className="mx-auto max-w-[470px]">
              {invite.status === "valid" ? (
                <RegisterForm
                  email={invite.email}
                  action={completeRegistrationAction.bind(null, invite.token)}
                />
              ) : (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h1 className="text-[42px] font-[600] leading-[1.05] tracking-[-0.04em] text-[#19211b] sm:text-[52px]">
                      Invitation unavailable
                    </h1>
                    <p className="text-[17px] text-[#738076]">
                      {invite.status === "expired"
                        ? "This invitation link has expired. Ask your administrator to send a new invite."
                        : "This invitation link is invalid. Check the full link from your email or ask for a new invite."}
                    </p>
                  </div>

                  <Link
                    href="/sign-in"
                    className="inline-flex h-[58px] w-full items-center justify-center rounded-[18px] bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] text-[18px] font-semibold text-white shadow-[0_18px_38px_rgba(23,90,59,0.18)] transition-transform hover:-translate-y-0.5"
                  >
                    Go to Sign In
                  </Link>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
