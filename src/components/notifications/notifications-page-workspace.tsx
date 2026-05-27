"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Mail,
  MailOpen,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { useNotificationCenter } from "@/components/notifications/notification-center";
import {
  NotificationContextBadge,
  NotificationUnreadDot,
  NotificationVisual,
} from "@/components/notifications/notification-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  notificationPageSizeOptions,
  notificationTabs,
  notificationTypeOptions,
  toNotificationStatusParam,
  type NotificationCountSummary,
  type NotificationListResponse,
  type NotificationRecord,
  type NotificationTabFilter,
  type NotificationTypeFilter,
} from "@/lib/notifications";
import { showErrorToast } from "@/lib/toast";

const emptyCounts: NotificationCountSummary = {
  All: 0,
  Unread: 0,
  Read: 0,
  Mentions: 0,
  Workflow: 0,
};

function buildNotificationsUrl(input: {
  page: number;
  pageSize: number;
  tab: NotificationTabFilter;
  typeFilter: NotificationTypeFilter;
  query: string;
}) {
  const searchParams = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
    status: toNotificationStatusParam(input.tab),
    type: input.typeFilter,
    query: input.query,
  });

  return `/api/notifications?${searchParams.toString()}`;
}

function NotificationListRow({
  notification,
  onToggleRead,
  onView,
}: {
  notification: NotificationRecord;
  onToggleRead: () => void;
  onView: () => void;
}) {
  return (
    <article className="grid grid-cols-[18px_minmax(0,1.9fr)_minmax(0,1fr)_190px_150px] items-center gap-4 border-b border-[#e7ece7] px-4 py-4 last:border-b-0 xl:px-5">
      <div className="flex justify-center">
        <NotificationUnreadDot unread={!notification.read} />
      </div>

      <div className="flex min-w-0 items-center gap-4">
        <NotificationVisual notification={notification} />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-[700] leading-5 text-[#18211a]">
            {notification.title}
          </p>
          <p className="mt-1 text-[14px] leading-5 text-[#5f6b62]">
            {notification.description}
          </p>
        </div>
      </div>

      <div className="justify-self-start">
        <NotificationContextBadge
          tone={notification.contextTone}
          label={notification.contextLabel}
        />
      </div>

      <p className="justify-self-start text-[14px] text-[#6d776f]">
        {notification.timestampLabel}
      </p>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onToggleRead}
          className={`grid h-11 w-11 cursor-pointer place-items-center rounded-full border transition ${
            notification.read
              ? "border-[#dbe4dc] bg-[#f4f8f4] text-[#5d6960] hover:bg-[#edf2ed]"
              : "border-brand/15 bg-[#eef8ef] text-brand hover:bg-[#e4f4e8]"
          }`}
          aria-label={notification.read ? "Mark as unread" : "Mark as read"}
        >
          {notification.read ? (
            <MailOpen className="h-4 w-4" />
          ) : (
            <Mail className="h-4 w-4" />
          )}
        </button>

        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-[84px] rounded-full text-[14px] font-[700]"
          onClick={onView}
        >
          View
        </Button>
      </div>
    </article>
  );
}

export function NotificationsPageWorkspace() {
  const router = useRouter();
  const {
    unreadCount,
    markAllAsRead,
    markNotificationAsRead,
    markNotificationAsUnread,
    refreshRecent,
  } = useNotificationCenter();

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [tab, setTab] = useState<NotificationTabFilter>("All");
  const [typeFilter, setTypeFilter] = useState<NotificationTypeFilter>("All Types");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] =
    useState<(typeof notificationPageSizeOptions)[number]>(8);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [counts, setCounts] = useState<NotificationCountSummary>(emptyCounts);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      try {
        const response = await fetch(
          buildNotificationsUrl({
            page: currentPage,
            pageSize: rowsPerPage,
            tab,
            typeFilter,
            query: deferredSearch,
          }),
          {
            method: "GET",
            cache: "no-store",
          },
        );

        const payload = (await response.json()) as
          | NotificationListResponse
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            typeof payload === "object" &&
              payload !== null &&
              "error" in payload &&
              typeof payload.error === "string"
              ? payload.error
              : "Unable to load notifications right now.",
          );
        }

        if (cancelled) {
          return;
        }

        const result = payload as NotificationListResponse;
        setNotifications(result.notifications);
        setCounts(result.counts);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        if (currentPage > result.totalPages) {
          setCurrentPage(result.totalPages);
        }
        setError(null);
        setLoading(false);
      } catch (nextError) {
        if (cancelled) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load notifications right now.",
        );
        setLoading(false);
      }
    }

    loadNotifications().catch(() => undefined);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }

      loadNotifications().catch(() => undefined);
    }, 30_000);

    function handleFocus() {
      loadNotifications().catch(() => undefined);
    }

    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [currentPage, deferredSearch, rowsPerPage, tab, typeFilter]);

  function updateTab(nextTab: NotificationTabFilter) {
    setLoading(true);
    setTab(nextTab);
    setCurrentPage(1);
  }

  function updateTypeFilter(nextType: NotificationTypeFilter) {
    setLoading(true);
    setTypeFilter(nextType);
    setCurrentPage(1);
  }

  async function refetchPage() {
    setLoading(true);

    try {
      const response = await fetch(
        buildNotificationsUrl({
          page: currentPage,
          pageSize: rowsPerPage,
          tab,
          typeFilter,
          query: deferredSearch,
        }),
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const payload = (await response.json()) as
        | NotificationListResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
            ? payload.error
            : "Unable to load notifications right now.",
        );
      }

      const result = payload as NotificationListResponse;
      setNotifications(result.notifications);
      setCounts(result.counts);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      if (currentPage > result.totalPages) {
        setCurrentPage(result.totalPages);
      }
      setError(null);
    } catch (nextError) {
      const message =
        nextError instanceof Error
          ? nextError.message
          : "Unable to load notifications right now.";
      setError(message);
      showErrorToast("Unable to load notifications.", message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleRead(notification: NotificationRecord) {
    try {
      if (notification.read) {
        await markNotificationAsUnread(notification.id);
      } else {
        await markNotificationAsRead(notification.id);
      }

      await Promise.all([refreshRecent(), refetchPage()]);
    } catch (nextError) {
      const message =
        nextError instanceof Error
          ? nextError.message
          : "Unable to update the notification right now.";
      showErrorToast("Unable to update notification.", message);
    }
  }

  async function handleView(notification: NotificationRecord) {
    try {
      if (!notification.read) {
        await markNotificationAsRead(notification.id);
      }
    } catch {
      // Keep navigation responsive even if the read-state update fails.
    }

    router.push(notification.targetHref);
  }

  const showingFrom = total === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const showingTo = total === 0 ? 0 : Math.min(currentPage * rowsPerPage, total);

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-[42px] font-[700] leading-none tracking-[-0.05em] text-[#143020] sm:text-[56px]">
            Notifications
          </h1>
          <p className="mt-3 text-[18px] text-[#68736a]">
            View, manage, and track all project and workflow notifications.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            size="lg"
            className="min-w-[170px] rounded-full text-[17px]"
            onClick={() =>
              markAllAsRead({ showToast: true })
                .then(() => Promise.all([refreshRecent(), refetchPage()]))
                .catch((nextError) => {
                  const message =
                    nextError instanceof Error
                      ? nextError.message
                      : "Unable to mark notifications as read right now.";
                  showErrorToast("Unable to mark notifications as read.", message);
                })
            }
          >
            <CheckCheck className="h-5 w-5" />
            Mark all as read
          </Button>
        </div>
      </header>

      <Card className="rounded-[30px] border-0 bg-surface p-6 shadow-[0_24px_80px_rgba(23,39,28,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8a81]" />
              <Input
                value={search}
                onChange={(event) => {
                  setLoading(true);
                  setSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search notifications..."
                className="h-[48px] border border-[#d8e0d8] pl-12 text-[15px] shadow-none"
              />
            </div>

            <div className="flex flex-wrap gap-2 rounded-[20px] border border-[#e4ebe4] bg-[#fafcf9] p-1.5">
              {notificationTabs.map((tabOption) => {
                const isActive = tab === tabOption;

                return (
                  <button
                    key={tabOption}
                    type="button"
                    onClick={() => updateTab(tabOption)}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-[16px] px-4 py-2.5 text-[14px] font-[700] transition ${
                      isActive
                        ? "bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] text-white shadow-[0_12px_28px_rgba(34,102,70,0.2)]"
                        : "text-[#2c352f] hover:bg-white"
                    }`}
                  >
                    <span>{tabOption}</span>
                    <span
                      className={`rounded-lg px-2 py-0.5 text-[11px] font-[800] ${
                        isActive
                          ? "bg-white/18 text-white"
                          : "bg-[#edf1ed] text-[#667268]"
                      }`}
                    >
                      {counts[tabOption]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-full xl:w-[190px]">
            <Select
              value={typeFilter}
              onValueChange={(value) => updateTypeFilter(value as NotificationTypeFilter)}
            >
              <SelectTrigger className="h-[48px] border border-[#d8e0d8] text-[15px] shadow-none">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-[#7f8a81]" />
                  <SelectValue placeholder="All Types" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {notificationTypeOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[24px] border border-[#e4ebe4] bg-white shadow-[0_18px_46px_rgba(23,39,28,0.05)]">
          {loading ? (
            <div className="px-6 py-16 text-center">
              <p className="text-[18px] font-[700] text-[#18211a]">
                Loading notifications...
              </p>
            </div>
          ) : error ? (
            <div className="px-6 py-16 text-center">
              <p className="text-[18px] font-[700] text-[#18211a]">
                Unable to load notifications.
              </p>
              <p className="mt-2 text-[14px] text-[#68736a]">{error}</p>
              <Button type="button" className="mt-5" onClick={() => refetchPage()}>
                Retry
              </Button>
            </div>
          ) : notifications.length > 0 ? (
            notifications.map((notification) => (
              <NotificationListRow
                key={notification.id}
                notification={notification}
                onToggleRead={() => handleToggleRead(notification)}
                onView={() => handleView(notification)}
              />
            ))
          ) : (
            <div className="px-6 py-16 text-center">
              <p className="text-[18px] font-[700] text-[#18211a]">
                No notifications found.
              </p>
              <p className="mt-2 text-[14px] text-[#68736a]">
                Try changing your filters.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4 border-t border-[#e7ece7] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-[14px] text-[#5f6b62]">
              Showing {showingFrom} to {showingTo} of {total} notifications
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    setCurrentPage((current) => Math.max(1, current - 1));
                  }}
                  disabled={currentPage === 1}
                  className="grid h-11 w-11 cursor-pointer place-items-center rounded-[16px] border border-[#dce4dc] bg-white text-[#314036] transition hover:bg-[#f6faf6] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => {
                      setLoading(true);
                      setCurrentPage(page);
                    }}
                    className={`grid h-11 min-w-11 cursor-pointer place-items-center rounded-[16px] px-3 text-[15px] font-[700] transition ${
                      page === currentPage
                        ? "bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] text-white shadow-[0_14px_28px_rgba(34,102,70,0.24)]"
                        : "border border-[#dce4dc] bg-white text-[#314036] hover:bg-[#f6faf6]"
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    setCurrentPage((current) => Math.min(totalPages, current + 1));
                  }}
                  disabled={currentPage === totalPages}
                  className="grid h-11 w-11 cursor-pointer place-items-center rounded-[16px] border border-[#dce4dc] bg-white text-[#314036] transition hover:bg-[#f6faf6] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <Select
                value={String(rowsPerPage)}
                onValueChange={(value) => {
                  setLoading(true);
                  setRowsPerPage(
                    Number(value) as (typeof notificationPageSizeOptions)[number],
                  );
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-11 w-[118px] border border-[#dce4dc] text-[14px] shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {notificationPageSizeOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      {!loading && unreadCount === 0 ? (
        <div className="rounded-[22px] border border-[#dbe5dc] bg-[#f7fbf6] px-5 py-4 text-[14px] text-[#5f6b62]">
          All notifications are marked as read.
        </div>
      ) : null}
    </section>
  );
}
