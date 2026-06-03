import {
  hasPermission,
  type PermissionUser,
} from "@/lib/permissions/resolver";

export function getRestrictedAreaFallbackRoute(user: PermissionUser) {
  if (hasPermission(user, "settings.viewOwnProfile")) {
    return "/settings";
  }

  if (hasPermission(user, "notification.view")) {
    return "/notifications";
  }

  return "/no-access";
}
