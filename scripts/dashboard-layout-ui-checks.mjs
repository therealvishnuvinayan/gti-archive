import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [shell, sidebar, topbar, notifications, appFrame, backButton, chat, schema, dashboardCountRoute] =
  await Promise.all([
    readFile("src/components/layout/dashboard-shell.tsx", "utf8"),
    readFile("src/components/layout/sidebar.tsx", "utf8"),
    readFile("src/components/layout/topbar.tsx", "utf8"),
    readFile("src/components/notifications/notification-dropdown.tsx", "utf8"),
    readFile("src/components/layout/dashboard-app-frame.tsx", "utf8"),
    readFile("src/components/projects/project-back-button.tsx", "utf8"),
    readFile("src/components/projects/project-chat-workspace.tsx", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
    readFile("src/app/api/projects/dashboard-count/route.ts", "utf8"),
  ]);

assert(
  shell.includes('const [sidebarCollapsed, setSidebarCollapsed] = useState(false)') &&
    shell.includes('"gti-sidebar-collapsed"') &&
    shell.includes("window.localStorage.getItem") &&
    shell.includes("window.localStorage.setItem"),
  "The desktop sidebar must start expanded and persist its client-side preference.",
);
assert(
  shell.includes("isCollapsed={sidebarCollapsed}") &&
    shell.includes("onToggleCollapsed={toggleSidebarCollapsed}"),
  "The shared dashboard shell must own one sidebar collapse state.",
);
assert(
  shell.includes('className="flex h-full w-full min-w-0 gap-3 xl:gap-4"') &&
    !shell.includes("max-w-[1600px]") &&
    shell.includes("min-h-0 min-w-0 flex-1"),
  "The app frame must use the available viewport width and preserve min-width: 0.",
);
assert(
  shell.includes('pathname.includes("/chat")') &&
    shell.includes("stages\\/[34]\\/concepts") &&
    shell.includes('data-layout-density={denseWorkspace ? "workspace" : "standard"}') &&
    shell.includes('"p-2 sm:p-3 lg:p-3"'),
  "Chat and concept-chat routes must receive the shared dense workspace gutter.",
);

assert(
  sidebar.includes('"xl:w-[76px] xl:px-2"') &&
    sidebar.includes('"xl:w-[280px] xl:px-4"') &&
    sidebar.includes("xl:transition-[width,padding]") &&
    sidebar.includes("xl:static") &&
    sidebar.includes("xl:hidden"),
  "Sidebar must transition between a 280px desktop panel, a 76px rail, and a mobile drawer.",
);
assert(
  sidebar.includes('aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}') &&
    sidebar.indexOf('aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}') <
      sidebar.indexOf('<nav className=') &&
    sidebar.includes("xl:flex-col xl:gap-2") &&
    sidebar.includes("PanelLeftOpen") &&
    sidebar.includes("PanelLeftClose"),
  "Sidebar toggle must be an accessible icon beside the branding rather than a bottom action.",
);
assert(
  sidebar.includes("LogoMark compact") &&
    sidebar.includes('alt="GTI logo mark"') &&
    sidebar.includes('alt="GTI logo"'),
  "Expanded and collapsed branding must use full and compact logo treatments.",
);
assert(
  sidebar.includes("createPortal") &&
    sidebar.includes('role="tooltip"') &&
    sidebar.includes("onMouseEnter={showTooltip}") &&
    sidebar.includes("onFocus={showTooltip}") &&
    sidebar.includes("onBlur={hideTooltip}"),
  "Collapsed navigation tooltips must work for pointer and keyboard focus without clipping.",
);
assert(
  sidebar.includes("isActive") &&
    sidebar.includes("bg-white text-[#121714]") &&
    sidebar.includes("xl:absolute xl:right-0 xl:top-0") &&
    sidebar.includes("unreadCount"),
  "Collapsed navigation must preserve active styling and compact project/notification badges.",
);
assert(
  sidebar.includes("payload.total") &&
    !sidebar.includes("payload.ongoing") &&
    dashboardCountRoute.includes("{ total: counts.total }") &&
    !dashboardCountRoute.includes("{ ongoing: counts.ongoing }"),
  "The Projects sidebar badge must use the same accessible total-project count as the Dashboard KPI.",
);

assert(
  topbar.includes("min-h-14") &&
    topbar.includes("sm:min-h-16") &&
    topbar.includes("size-10") &&
    topbar.includes("hidden min-w-0 flex-1 text-left xl:block") &&
    !topbar.includes("sm:min-w-[250px]"),
  "The shared topbar and profile trigger must be compact and responsive.",
);
assert(
  notifications.includes('aria-label="Notifications"') &&
    notifications.includes("size-10") &&
    notifications.includes("unreadCount > 0") &&
    notifications.includes("setOpen((current) => !current)"),
  "The compact notification control must preserve its unread state and behavior.",
);
assert(
  appFrame.includes("getDashboardBackNavigation") &&
    appFrame.includes("ProjectBackButton") &&
    backButton.includes('size="sm"') &&
    backButton.includes("min-h-9 rounded-[12px]"),
  "Shared back controls must retain their links in a more compact treatment.",
);

assert(
  chat.includes("h-[clamp(360px,calc(100dvh-13rem),720px)]") &&
    chat.includes("h-[calc(100dvh-11rem)]") &&
    chat.includes("ProjectAccessRealtimeGuard") &&
    chat.includes("handleChatScroll") &&
    chat.includes("pendingCommentFiles"),
  "Chat must use the recovered vertical space without changing its existing functional surfaces.",
);
assert(
  schema.includes("model Project") && !schema.includes("gti-sidebar-collapsed"),
  "Sidebar preferences must not introduce database persistence.",
);

console.log("Global dashboard layout density and collapsible-sidebar checks passed.");
