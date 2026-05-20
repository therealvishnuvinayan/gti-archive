import Image from "next/image";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SignInPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  const hasAnyUsers = (await prisma.user.count()) > 0;

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
                <h2 className="max-w-[260px] text-[56px] font-[600] leading-[0.98] tracking-[-0.05em]">
                  Welcome back
                </h2>
                <p className="max-w-[320px] text-[17px] leading-8 text-white/88">
                  Sign in to continue managing projects and collaborating with
                  your team.
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
              <SignInForm hasAnyUsers={hasAnyUsers} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
