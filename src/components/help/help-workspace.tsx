import type { ComponentType } from "react";
import {
  ArrowRight,
  BookOpenText,
  CircleHelp,
  FileArchive,
  FolderKanban,
  Headset,
  Mail,
  MessageSquareMore,
  Search,
  Settings2,
  UserCog,
  Users,
} from "lucide-react";

type HelpCategory = {
  title: string;
  description: string;
  articleCount: string;
  icon: ComponentType<{ className?: string }>;
};

type SupportOption = {
  title: string;
  description: string;
  actionLabel: string;
  icon: ComponentType<{ className?: string }>;
};

const helpCategories: HelpCategory[] = [
  {
    title: "Getting Started",
    description: "Learn the basics and set up your account.",
    articleCount: "5 articles",
    icon: BookOpenText,
  },
  {
    title: "Projects",
    description: "Create, manage and track your projects.",
    articleCount: "8 articles",
    icon: FolderKanban,
  },
  {
    title: "Collaboration",
    description: "Work with your team and manage permissions.",
    articleCount: "6 articles",
    icon: Users,
  },
  {
    title: "Library & Archives",
    description: "Organize and access your files and assets.",
    articleCount: "7 articles",
    icon: FileArchive,
  },
  {
    title: "Settings & Account",
    description: "Manage your preferences and account settings.",
    articleCount: "6 articles",
    icon: Settings2,
  },
];

const popularArticles = [
  "How to create a new project",
  "How to upload and organize files",
  "Managing collaborators and permissions",
  "How to schedule events in calendar",
  "Reset your password",
];

const supportOptions: SupportOption[] = [
  {
    title: "Contact Support",
    description: "Send us an email and we'll get back to you.",
    actionLabel: "Send Email",
    icon: Mail,
  },
  {
    title: "Request a Call",
    description: "Schedule a call with our support team.",
    actionLabel: "Request Call",
    icon: MessageSquareMore,
  },
  {
    title: "System Administrator",
    description:
      "For access issues or system related problems, please contact your system administrator.",
    actionLabel: "View Details",
    icon: UserCog,
  },
];

export function HelpWorkspace() {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-[44px] font-[600] leading-none tracking-[-0.05em] text-[#121813]">
          Help
        </h1>
        <p className="text-[15px] text-[#6f776f]">
          Find answers, guides and support for using the PMS.
        </p>
      </header>

      <section className="rounded-[24px] border border-[#ebefe8] bg-white p-5 shadow-[0_16px_48px_rgba(23,39,28,0.05)] sm:p-6">
        <div className="space-y-4">
          <h2 className="text-[28px] font-[600] leading-tight tracking-[-0.03em] text-[#1b231d]">
            How can we help you?
          </h2>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <label className="flex h-[54px] flex-1 items-center gap-3 rounded-2xl border border-[#dfe6de] bg-white px-5">
              <Search className="h-4.5 w-4.5 text-[#8d978e]" />
              <input
                type="search"
                placeholder="Search for help articles, guides and more..."
                className="w-full bg-transparent text-[15px] text-[#1c241e] outline-none placeholder:text-[#9aa39a]"
              />
            </label>

            <div className="flex h-[54px] w-[86px] items-center justify-center rounded-[18px] bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] shadow-[0_14px_30px_rgba(33,99,68,0.16)]">
              <div className="relative">
                <Headset className="h-7 w-7 text-white" />
                <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-[#dff7e5]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[28px] font-[600] leading-tight tracking-[-0.03em] text-[#1b231d]">
            Browse by category
          </h2>
          <button
            type="button"
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-brand transition-colors hover:text-brand-dark"
          >
            View all articles
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-5">
          {helpCategories.map((category) => {
            const Icon = category.icon;

            return (
              <article
                key={category.title}
                className="rounded-[22px] border border-[#ebefe8] bg-white p-5 shadow-[0_16px_48px_rgba(23,39,28,0.05)]"
              >
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#edf7ef] text-brand">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-6 space-y-2">
                  <h3 className="text-[18px] font-[600] leading-snug text-[#1d241e]">
                    {category.title}
                  </h3>
                  <p className="min-h-[48px] text-[14px] leading-6 text-[#758077]">
                    {category.description}
                  </p>
                </div>
                <button
                  type="button"
                  className="mt-6 inline-flex items-center gap-2 text-[13px] font-semibold text-brand transition-colors hover:text-brand-dark"
                >
                  {category.articleCount}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="rounded-[24px] border border-[#ebefe8] bg-white p-5 shadow-[0_16px_48px_rgba(23,39,28,0.05)] sm:p-6">
          <h2 className="text-[28px] font-[600] leading-tight tracking-[-0.03em] text-[#1b231d]">
            Popular articles
          </h2>

          <div className="mt-5 overflow-hidden rounded-[20px] border border-[#edf2eb]">
            {popularArticles.map((article, index) => (
              <button
                key={article}
                type="button"
                className={`flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[#fafcf9] ${
                  index !== popularArticles.length - 1
                    ? "border-b border-[#edf2eb]"
                    : ""
                }`}
              >
                <CircleHelp className="h-4 w-4 shrink-0 text-[#8fa294]" />
                <span className="flex-1 text-[14px] font-medium text-[#233026]">
                  {article}
                </span>
                <ArrowRight className="h-4 w-4 text-[#7e877e]" />
              </button>
            ))}
          </div>

          <button
            type="button"
            className="mt-5 inline-flex items-center gap-2 text-[13px] font-semibold text-brand transition-colors hover:text-brand-dark"
          >
            View all popular articles
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>

        <section className="rounded-[24px] border border-[#ebefe8] bg-white p-5 shadow-[0_16px_48px_rgba(23,39,28,0.05)] sm:p-6">
          <div className="space-y-2">
            <h2 className="text-[28px] font-[600] leading-tight tracking-[-0.03em] text-[#1b231d]">
              Still need help?
            </h2>
            <p className="text-[14px] text-[#768078]">
              Can&apos;t find what you&apos;re looking for? Our support team is
              here to help.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            {supportOptions.map((option) => {
              const Icon = option.icon;

              return (
                <div
                  key={option.title}
                  className="flex flex-col gap-4 rounded-[20px] border border-[#edf2eb] bg-[#fcfdfb] px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex items-start gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#edf7ef] text-brand">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-[15px] font-semibold text-[#1d251f]">
                        {option.title}
                      </h3>
                      <p className="max-w-[340px] text-[13px] leading-6 text-[#748075]">
                        {option.description}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="inline-flex h-[42px] items-center justify-center rounded-xl border border-[#b8d8c0] bg-white px-4 text-[13px] font-semibold text-brand shadow-[0_8px_20px_rgba(35,104,72,0.06)] transition-colors hover:bg-brand-soft"
                  >
                    {option.actionLabel}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
