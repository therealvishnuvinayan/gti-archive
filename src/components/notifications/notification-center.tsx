"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { dummyNotifications, type NotificationRecord } from "@/lib/notifications";

type NotificationCenterContextValue = {
  notifications: NotificationRecord[];
  unreadCount: number;
  recentNotifications: NotificationRecord[];
  markAllAsRead: () => void;
  toggleReadState: (notificationId: string) => void;
};

const NotificationCenterContext = createContext<NotificationCenterContextValue | null>(null);

export function NotificationCenterProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>(dummyNotifications);

  const value = useMemo<NotificationCenterContextValue>(() => {
    const orderedNotifications = [...notifications].sort(
      (left, right) => right.sortOrder - left.sortOrder,
    );

    return {
      notifications: orderedNotifications,
      unreadCount: orderedNotifications.filter((notification) => !notification.read).length,
      recentNotifications: orderedNotifications.slice(0, 5),
      markAllAsRead: () => {
        setNotifications((current) =>
          current.map((notification) =>
            notification.read ? notification : { ...notification, read: true },
          ),
        );
      },
      toggleReadState: (notificationId: string) => {
        setNotifications((current) =>
          current.map((notification) =>
            notification.id === notificationId
              ? { ...notification, read: !notification.read }
              : notification,
          ),
        );
      },
    };
  }, [notifications]);

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
