import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "GTI Archive",
  description:
    "A secure project archive and workflow management platform for organizing projects, documents, approvals, and team collaboration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
