"use client";

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  NotificationRecentResponse,
  NotificationRecord,
} from "@/lib/notifications";
import { showSuccessToast } from "@/lib/toast";

const NOTIFICATION_REFRESH_INTERVAL_MS = 120_000;
const NOTIFICATION_FOCUS_REFRESH_STALE_MS = 60_000;
const NOTIFICATION_RECENT_CACHE_KEY = "gti:recent-notifications";
const NOTIFICATION_RECENT_CACHE_TTL_MS = 30_000;

type NotificationCenterContextValue = {
  recentNotifications: NotificationRecord[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  refreshRecent: () => Promise<void>;
  markAllAsRead: (options?: { showToast?: boolean }) => Promise<void>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  markNotificationAsUnread: (notificationId: string) => Promise<void>;
  setNotificationReadState: (
    notificationId: string,
    read: boolean,
  ) => Promise<void>;
};

const NotificationCenterContext =
  createContext<NotificationCenterContextValue | null>(null);

async function fetchRecentNotifications(signal?: AbortSignal) {
  const response = await fetch("/api/notifications/recent", {
    method: "GET",
    cache: "no-store",
    signal,
  });

  const payload = (await response.json()) as
    | NotificationRecentResponse
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

  return payload as NotificationRecentResponse;
}

function readCachedRecentNotifications() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cachedValue = window.sessionStorage.getItem(NOTIFICATION_RECENT_CACHE_KEY);

    if (!cachedValue) {
      return null;
    }

    const payload = JSON.parse(cachedValue) as {
      data?: NotificationRecentResponse;
      cachedAt?: unknown;
    };

    if (
      !payload.data ||
      typeof payload.cachedAt !== "number" ||
      Date.now() - payload.cachedAt > NOTIFICATION_RECENT_CACHE_TTL_MS
    ) {
      return null;
    }

    return payload.data;
  } catch {
    return null;
  }
}

function cacheRecentNotifications(payload: NotificationRecentResponse) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      NOTIFICATION_RECENT_CACHE_KEY,
      JSON.stringify({
        data: payload,
        cachedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore storage failures; notifications can still load from the API.
  }
}

async function updateNotificationReadState(notificationId: string, read: boolean) {
  const response = await fetch(
    `/api/notifications/${notificationId}/${read ? "read" : "unread"}`,
    {
      method: "POST",
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as
    | { unreadCount: number }
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : "Unable to update the notification state.",
    );
  }

  return payload as { unreadCount: number };
}

async function postMarkAllAsRead() {
  const response = await fetch("/api/notifications/read-all", {
    method: "POST",
    cache: "no-store",
  });

  const payload = (await response.json()) as
    | { unreadCount: number }
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
        ? payload.error
        : "Unable to mark notifications as read.",
    );
  }

  return payload as { unreadCount: number };
}

export function NotificationCenterProvider({ children }: { children: ReactNode }) {
  const [recentNotifications, setRecentNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const lastRefreshAtRef = useRef(0);

  const refreshRecent = useCallback(async () => {
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const refreshPromise = fetchRecentNotifications()
      .then((payload) => {
        setRecentNotifications(payload.notifications);
        setUnreadCount(payload.unreadCount);
        setError(null);
        setIsLoading(false);
        lastRefreshAtRef.current = Date.now();
        cacheRecentNotifications(payload);
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });

    refreshPromiseRef.current = refreshPromise;

    return refreshPromise;
  }, []);

  const setNotificationReadState = useCallback(async (notificationId: string, read: boolean) => {
    setRecentNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? { ...notification, read }
          : notification,
      ),
    );
    setUnreadCount((current) => Math.max(0, current + (read ? -1 : 1)));

    try {
      const payload = await updateNotificationReadState(notificationId, read);
      setUnreadCount(payload.unreadCount);
    } catch (nextError) {
      await refreshRecent().catch(() => undefined);
      throw nextError;
    }
  }, [refreshRecent]);

  const markAllAsRead = useCallback(async (options?: { showToast?: boolean }) => {
    setRecentNotifications((current) =>
      current.map((notification) =>
        notification.read ? notification : { ...notification, read: true },
      ),
    );
    setUnreadCount(0);

    try {
      const payload = await postMarkAllAsRead();
      setUnreadCount(payload.unreadCount);

      if (options?.showToast) {
        showSuccessToast("All notifications marked as read.");
      }
    } catch (nextError) {
      await refreshRecent().catch(() => undefined);
      throw nextError;
    }
  }, [refreshRecent]);

  useEffect(() => {
    const controller = new AbortController();
    const cachedNotifications = readCachedRecentNotifications();
    let cacheTimeoutId: number | null = null;

    if (cachedNotifications) {
      lastRefreshAtRef.current = Date.now();
      cacheTimeoutId = window.setTimeout(() => {
        setRecentNotifications(cachedNotifications.notifications);
        setUnreadCount(cachedNotifications.unreadCount);
        setIsLoading(false);
      }, 0);
    }

    const initialRefreshTimeoutId = window.setTimeout(() => {
      refreshRecent()
        .catch((nextError) => {
          if (controller.signal.aborted) {
            return;
          }

          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to load notifications right now.",
          );
          setIsLoading(false);
        });
    }, cachedNotifications ? 1_000 : 500);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden") {
        return;
      }

      refreshRecent().catch((nextError) => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to refresh notifications right now.",
        );
      });
    }, NOTIFICATION_REFRESH_INTERVAL_MS);

    function handleFocus() {
      if (Date.now() - lastRefreshAtRef.current < NOTIFICATION_FOCUS_REFRESH_STALE_MS) {
        return;
      }

      refreshRecent().catch((nextError) => {
        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to refresh notifications right now.",
        );
      });
    }

    window.addEventListener("focus", handleFocus);

    return () => {
      controller.abort();
      if (cacheTimeoutId) {
        window.clearTimeout(cacheTimeoutId);
      }
      window.clearTimeout(initialRefreshTimeoutId);
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshRecent]);

  const value: NotificationCenterContextValue = {
    recentNotifications,
    unreadCount,
    isLoading,
    error,
    refreshRecent,
    markAllAsRead,
    markNotificationAsRead: (notificationId: string) =>
      setNotificationReadState(notificationId, true),
    markNotificationAsUnread: (notificationId: string) =>
      setNotificationReadState(notificationId, false),
    setNotificationReadState,
  };

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
    </NotificationCenterContext.Provider>
  );
}

export function useNotificationCenter() {
  const context = useContext(NotificationCenterContext);

  if (!context) {
    throw new Error("useNotificationCenter must be used within NotificationCenterProvider.");
  }

  return context;
}
