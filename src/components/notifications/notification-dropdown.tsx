"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronRight } from "lucide-react";

import { useNotificationCenter } from "@/components/notifications/notification-center";
import {
  NotificationUnreadDot,
  NotificationVisual,
} from "@/components/notifications/notification-primitives";
import { Button } from "@/components/ui/button";

export function NotificationDropdown() {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const { recentNotifications, unreadCount, markAllAsRead } = useNotificationCenter();

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative grid h-[54px] w-[54px] place-items-center rounded-full bg-white text-[#1c241d] shadow-[0_10px_24px_rgba(15,26,20,0.05)] transition-transform hover:-translate-y-0.5"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 ? (
          <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-white" />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+14px)] z-50 w-[min(92vw,452px)] rounded-[30px] border border-[#e4ebe5] bg-white shadow-[0_30px_90px_rgba(23,39,28,0.16)]">
          <div className="flex items-center justify-between px-7 py-5">
            <div className="flex items-center gap-3">
              <h2 className="text-[18px] font-[700] text-[#173120]">Notifications</h2>
              <span className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-[700] text-white">
                {unreadCount}
              </span>
            </div>
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-[14px] font-[700] text-brand transition hover:text-[#1f734a]"
            >
              Mark all as read
            </button>
          </div>

          <div className="border-t border-[#eef2ee]">
            {recentNotifications.map((notification) => (
              <div
                key={notification.id}
                className="grid grid-cols-[14px_minmax(0,1fr)] gap-3 border-b border-[#eef2ee] px-5 py-4 last:border-b-0"
              >
                <div className="flex justify-center pt-4">
                  <NotificationUnreadDot unread={!notification.read} />
                </div>
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-4">
                  <NotificationVisual notification={notification} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-[700] leading-5 text-[#18211a]">
                      {notification.title}
                    </p>
                    <p className="mt-1 text-[13px] leading-5 text-[#5f6b62]">
                      {notification.description}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-[12px] text-[#7d877f]">
                    {notification.timestampLabel}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-[#eef2ee] px-5 py-4">
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full rounded-[18px] py-3 text-[15px] font-[700] text-brand hover:bg-[#f4fbf5]"
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
            >
              View all notifications
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
