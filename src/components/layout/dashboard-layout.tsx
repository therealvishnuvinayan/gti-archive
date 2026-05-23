import type { ReactNode } from "react";

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

export function DashboardLayout({
  children,
  topbarProps,
}: DashboardLayoutProps) {
  void topbarProps;

  return <>{children}</>;
}
