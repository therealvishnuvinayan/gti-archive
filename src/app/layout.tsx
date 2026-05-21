import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "GTI Archieve",
  description: "Reusable dashboard UI built with Next.js App Router and Tailwind CSS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
