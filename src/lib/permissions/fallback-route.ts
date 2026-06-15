import {
  isProjectAdmin,
  hasPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";

export function getAuthenticatedDefaultRoute(user: PermissionUser) {
  if (hasPermission(user, "dashboard.view")) {
    return "/";
  }

  if (hasPermission(user, "project.list") || hasPermission(user, "project.view")) {
    return "/projects";
  }

  if (hasPermission(user, "calendar.view")) {
    return "/calendar";
  }

  if (hasPermission(user, "collaboration.viewDirectory")) {
    return "/collaboration";
  }

  if (isProjectAdmin(user) && hasPermission(user, "users.view")) {
    return "/users";
  }

  if (hasPermission(user, "notification.view")) {
    return "/notifications";
  }

  if (hasPermission(user, "library.view")) {
    return "/library";
  }

  if (hasPermission(user, "archive.view")) {
    return "/archives";
  }

  if (hasPermission(user, "settings.viewOwnProfile")) {
    return "/settings";
  }

  if (hasPermission(user, "help.view")) {
    return "/help";
  }

  return "/no-access";
}

export function getRestrictedAreaFallbackRoute(user: PermissionUser) {
  if (hasPermission(user, "settings.viewOwnProfile")) {
    return "/settings";
  }

  if (hasPermission(user, "notification.view")) {
    return "/notifications";
  }

  return "/no-access";
}
