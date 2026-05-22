import type { ReactNode } from "react";

import { requireUser } from "@/lib/auth";

type DashboardLayoutProps = {
  children: React.ReactNode;
  topbarProps?: {
    searchPlaceholder?: string;
    leadingContent?: ReactNode;
    showSearch?: boolean;
    searchAction?: string;
    searchName?: string;
    searchDefaultValue?: string;
    searchHiddenFields?: Array<{
      name: string;
      value: string;
    }>;
  };
};

export async function DashboardLayout({
  children,
  topbarProps,
}: DashboardLayoutProps) {
  void topbarProps;
  await requireUser();

  return <>{children}</>;
}
