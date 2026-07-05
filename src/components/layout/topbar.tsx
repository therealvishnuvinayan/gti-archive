"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, LogOut, Menu } from "lucide-react";

import { NotificationDropdown } from "@/components/notifications/notification-dropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type DashboardUserView = {
  name: string;
  email: string;
  initials: string;
  avatarSrc?: string | null;
};

export type DashboardTopbarProps = {
  user?: DashboardUserView;
  onOpenSidebar: () => void;
  leadingContent?: ReactNode;
  showNotifications?: boolean;
};

const defaultUser: DashboardUserView = {
  name: "Account",
  email: "User account",
  initials: "A",
  avatarSrc: null,
};

function UserAvatar({ user }: { user: DashboardUserView }) {
  if (user.avatarSrc) {
    return (
      <AvatarImage
        key={user.avatarSrc}
        src={user.avatarSrc}
        alt={`${user.name} avatar`}
        className="h-11 w-11 sm:h-[56px] sm:w-[56px]"
        fallback={
          <div className="grid h-11 w-11 place-items-center rounded-full bg-[radial-gradient(circle_at_top,#ffd7c5,#d88f6c_55%,#7c4a34)] text-[17px] font-bold text-white sm:h-[56px] sm:w-[56px] sm:text-[20px]">
            {user.initials}
          </div>
        }
      />
    );
  }

  return (
    <div className="grid h-11 w-11 place-items-center rounded-full bg-[radial-gradient(circle_at_top,#ffd7c5,#d88f6c_55%,#7c4a34)] text-[17px] font-bold text-white sm:h-[56px] sm:w-[56px] sm:text-[20px]">
      {user.initials}
    </div>
  );
}

function AvatarImage({
  src,
  alt,
  className,
  fallback,
}: {
  src: string;
  alt: string;
  className: string;
  fallback: ReactNode;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    return <>{fallback}</>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`${className} rounded-full object-cover`}
      onError={() => setImageFailed(true)}
    />
  );
}

export function Topbar({
  user = defaultUser,
  onOpenSidebar,
  leadingContent,
  showNotifications = true,
}: DashboardTopbarProps) {
  const signOutFormRef = useRef<HTMLFormElement>(null);
  const [signOutPending, setSignOutPending] = useState(false);

  return (
    <header className="rounded-[24px] bg-surface px-3 py-3 shadow-[0_18px_40px_rgba(23,39,28,0.05)] sm:rounded-[30px] sm:px-6 sm:py-4 lg:px-8">
      <form ref={signOutFormRef} action="/sign-out" method="post" className="hidden" />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenSidebar}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-line bg-white text-[#263129] shadow-[0_8px_24px_rgba(15,26,20,0.06)] sm:h-12 sm:w-12 lg:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>

            {leadingContent}
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-4">
          {showNotifications ? <NotificationDropdown /> : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 max-w-[250px] cursor-pointer items-center gap-2 rounded-full bg-white px-2 py-1.5 shadow-[0_10px_24px_rgba(15,26,20,0.05)] outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-brand/35 sm:min-w-[250px] sm:gap-3 sm:px-3 sm:py-2"
                aria-label="Open user menu"
              >
                <UserAvatar user={user} />
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[14px] font-extrabold leading-tight text-[#18211a] sm:text-[17px]">
                    {user.name}
                  </p>
                  <p className="truncate text-[11px] text-muted sm:text-[13px]">
                    {user.email}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-[#7d877f]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[260px]">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <div className="px-3 pb-2">
                <p className="truncate text-[15px] font-semibold text-[#18211a]">
                  {user.name}
                </p>
                <p className="truncate text-[13px] text-muted">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={signOutPending}
                className="cursor-pointer hover:bg-[#fff4f3] hover:text-[#ba3f31]"
                onSelect={(event) => {
                  event.preventDefault();

                  if (signOutPending) {
                    return;
                  }

                  setSignOutPending(true);
                  signOutFormRef.current?.requestSubmit();
                }}
              >
                <LogOut className="h-4 w-4" />
                {signOutPending ? "Signing out..." : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
