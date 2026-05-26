"use client";

import { CheckCircle2, Info, Loader2, OctagonAlert, TriangleAlert } from "lucide-react";
import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      closeButton
      expand={false}
      visibleToasts={4}
      toastOptions={{
        duration: 4200,
        classNames: {
          toast:
            "group rounded-[22px] border border-[#e4ebe4] bg-white/98 px-4 py-3 shadow-[0_18px_50px_rgba(16,30,22,0.12)] backdrop-blur",
          title:
            "text-[14px] font-[700] tracking-[-0.02em] text-[#162019]",
          description: "text-[12px] leading-5 text-[#69756c]",
          success: "border-[#d3e7d9]",
          error: "border-[#f0d4d2]",
          warning: "border-[#f6e0b7]",
          info: "border-[#d7e2ff]",
          closeButton:
            "border border-[#e4ebe4] bg-white text-[#6b756d] hover:bg-[#f7faf7] hover:text-[#1b231d]",
        },
      }}
      icons={{
        success: <CheckCircle2 className="h-4 w-4 text-[#2f8d5d]" />,
        error: <OctagonAlert className="h-4 w-4 text-[#c5524d]" />,
        warning: <TriangleAlert className="h-4 w-4 text-[#b88018]" />,
        info: <Info className="h-4 w-4 text-[#4c78d8]" />,
        loading: <Loader2 className="h-4 w-4 animate-spin text-[#2f8d5d]" />,
      }}
    />
  );
}
