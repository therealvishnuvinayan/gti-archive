import { randomUUID } from "node:crypto";

import { AttachmentStatus, UserRole } from "@prisma/client";

import {
  buildCalendarAccessState,
  createCalendarEvent,
} from "../src/lib/calendar";
import {
  getLibraryPageDataForUser,
  getManualLibraryAssetDownloadUrlForUser,
  requestManualLibraryAssetUpload,
} from "../src/lib/library";
import { addManualLibraryAssetFavorite } from "../src/lib/manual-library-asset-favorites";
import {
  getNotificationsForUser,
  markNotificationAsRead,
} from "../src/lib/notification-center";
import {
  allPermissionKeys,
  defaultRolePermissions,
  type PermissionKey,
} from "../src/lib/permissions/definitions";
import type { PermissionProfileSnapshot } from "../src/lib/permissions/profiles";
import { prisma } from "../src/lib/prisma";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Final permissions integration check failed: ${message}`);
  }
}

async function expectDenied(task: Promise<unknown>, message: string) {
  try {
    const result = await task;
    if (result && typeof result === "object" && "error" in result) return;
  } catch {
    return;
  }
  throw new Error(`Final permissions integration check failed: ${message}`);
}

function snapshot(
  permissions: Iterable<PermissionKey>,
): PermissionProfileSnapshot {
  const permissionSet = new Set(permissions);
  return {
    effectivePermissions: permissionSet,
    rolePermissions: permissionSet,
    archiveAccessGranted: false,
    archiveAccessLevel: "NONE",
  };
}

async function main() {
  process.env.AWS_REGION ||= "us-east-1";
  process.env.AWS_ACCESS_KEY_ID ||= "final-permissions-test";
  process.env.AWS_SECRET_ACCESS_KEY ||= "final-permissions-test-secret";
  process.env.AWS_S3_BUCKET ||= "final-permissions-integration";
  process.env.S3_USE_ACCELERATE_ENDPOINT ||= "false";

  const runId = randomUUID();
  const ids = {
    admin: `permission-admin-${runId}`,
    userOne: `permission-user-one-${runId}`,
    userTwo: `permission-user-two-${runId}`,
    manualAsset: `permission-library-${runId}`,
  };
  const userIds = [ids.admin, ids.userOne, ids.userTwo];

  try {
    const [definitionCount, adminRows, userRows, superAdminRows] =
      await Promise.all([
        prisma.permissionDefinition.count({
          where: { key: { in: allPermissionKeys } },
        }),
        prisma.rolePermission.findMany({ where: { role: UserRole.ADMIN } }),
        prisma.rolePermission.findMany({ where: { role: UserRole.USER } }),
        prisma.rolePermission.findMany({
          where: { role: UserRole.SUPER_ADMIN },
        }),
      ]);
    check(
      definitionCount === allPermissionKeys.length,
      "the database permission catalog must match all code-defined keys",
    );
    check(
      adminRows.length === allPermissionKeys.length &&
        adminRows.every((row) => row.enabled),
      "the saved ADMIN profile must enable the complete business catalog",
    );
    const enabledUserKeys = userRows
      .filter((row) => row.enabled)
      .map((row) => row.permissionKey)
      .sort();
    check(
      JSON.stringify(enabledUserKeys) ===
        JSON.stringify([...defaultRolePermissions.USER].sort()),
      "the saved USER profile must match the final USER defaults",
    );
    check(
      superAdminRows.length === 0,
      "SUPER_ADMIN must remain code-controlled rather than an editable saved profile",
    );

    await prisma.user.createMany({
      data: [
        [ids.admin, UserRole.ADMIN],
        [ids.userOne, UserRole.USER],
        [ids.userTwo, UserRole.USER],
      ].map(([id, role]) => ({
        id,
        email: `${id}@example.test`,
        name: id,
        passwordHash: "isolated-permissions-test-only",
        role: role as UserRole,
      })),
    });

    const admin = {
      id: ids.admin,
      role: UserRole.ADMIN,
      name: "Permission Admin",
      email: `${ids.admin}@example.test`,
    };
    const viewOnlyUser = {
      id: ids.userOne,
      role: UserRole.USER,
      name: "View-only User",
      email: `${ids.userOne}@example.test`,
      permissionProfileSnapshot: snapshot([
        "calendar.view",
        "library.view",
        "notification.view",
      ]),
    };
    const assignedCalendarUser = {
      id: ids.userTwo,
      role: UserRole.USER,
      name: "Assigned Calendar User",
      email: `${ids.userTwo}@example.test`,
      permissionProfileSnapshot: snapshot(["calendar.view"]),
    };

    const adminEvent = await createCalendarEvent(admin, {
      title: `Admin event ${runId}`,
      details: "Manager schedule",
      date: "2026-08-20",
      start: "09:00",
      end: "10:00",
      calendar: "Projects",
      tone: "green",
    });
    check("event" in adminEvent, "ADMIN must create calendar events");
    check(
      !buildCalendarAccessState(viewOnlyUser, false).canManageCollaborators,
      "calendar.view alone must not grant participant administration",
    );
    check(
      !buildCalendarAccessState(assignedCalendarUser, true).canManageCollaborators,
      "calendar assignment without calendar.assignParticipants must remain non-admin",
    );
    check(
      !buildCalendarAccessState(viewOnlyUser, false).canViewSharedSchedule,
      "an unassigned USER must not receive the shared manager schedule",
    );
    check(
      buildCalendarAccessState(assignedCalendarUser, true).canViewSharedSchedule,
      "an explicitly assigned USER must receive the shared schedule",
    );
    await expectDenied(
      createCalendarEvent(viewOnlyUser, {
        title: "Forbidden USER event",
        details: "",
        date: "2026-08-20",
        start: "11:00",
        end: "12:00",
        calendar: "Events",
        tone: "blue",
      }),
      "calendar.view alone must not create events",
    );
    await prisma.manualLibraryAsset.create({
      data: {
        id: ids.manualAsset,
        assetName: `Permission Library ${runId}.pdf`,
        originalFileName: `permission-library-${runId}.pdf`,
        mimeType: "application/pdf",
        fileSize: 128,
        bucket: "final-permissions-integration",
        storageKey: `final-permissions-integration/${runId}.pdf`,
        status: AttachmentStatus.READY,
        uploadedById: ids.admin,
      },
    });
    const viewOnlyLibrary = await getLibraryPageDataForUser(viewOnlyUser);
    const restrictedItem = viewOnlyLibrary.items.find(
      (item) => item.id === ids.manualAsset,
    );
    check(restrictedItem, "library.view must expose a ready manual asset");
    check(
      !restrictedItem.canDownload && !restrictedItem.canFavorite,
      "Library item actions must follow file.download and file.favorite",
    );
    await expectDenied(
      getLibraryPageDataForUser(viewOnlyUser, { search: runId }),
      "library.view without library.filter must reject forged filters",
    );
    await expectDenied(
      getManualLibraryAssetDownloadUrlForUser(viewOnlyUser, ids.manualAsset),
      "library.view without file.download must reject direct downloads",
    );
    await expectDenied(
      addManualLibraryAssetFavorite(viewOnlyUser, ids.manualAsset),
      "library.view without file.favorite must reject favorite mutations",
    );
    await expectDenied(
      requestManualLibraryAssetUpload(viewOnlyUser, {
        assetName: "Forbidden upload",
        originalFileName: "forbidden.pdf",
        mimeType: "application/pdf",
        fileSize: 128,
        category: null,
        assetTagIds: [],
      }),
      "library.view without library.uploadAsset must reject uploads",
    );
    const adminLibrary = await getLibraryPageDataForUser(admin);
    const adminItem = adminLibrary.items.find(
      (item) => item.id === ids.manualAsset,
    );
    check(
      adminItem?.canDownload && adminItem.canFavorite,
      "ADMIN Library actions must remain enabled",
    );

    const [userOneNotification, userTwoNotification] =
      await prisma.$transaction([
        prisma.notification.create({
          data: {
            userId: ids.userOne,
            type: "MENTION",
            title: "USER one only",
            message: "Scoped notification",
          },
        }),
        prisma.notification.create({
          data: {
            userId: ids.userTwo,
            type: "MENTION",
            title: "USER two only",
            message: "Other scoped notification",
          },
        }),
      ]);
    const userOneNotifications = await getNotificationsForUser({
      userId: ids.userOne,
      page: 1,
      pageSize: 20,
      status: "all",
      type: "All Types",
      query: "",
    });
    check(
      userOneNotifications.notifications.some(
        (notification) => notification.id === userOneNotification.id,
      ) &&
        !userOneNotifications.notifications.some(
          (notification) => notification.id === userTwoNotification.id,
        ),
      "notification reads must remain recipient-scoped",
    );
    await expectDenied(
      markNotificationAsRead(userTwoNotification.id, ids.userOne),
      "a USER must not mutate another USER's notification by ID",
    );

    console.log(
      "Permission catalog, Calendar, Library, and Notifications isolated integration checks passed.",
    );
  } finally {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.manualLibraryAsset.deleteMany({ where: { id: ids.manualAsset } });
    await prisma.calendarEvent.deleteMany({
      where: { createdById: { in: userIds } },
    });
    await prisma.calendarCollaborator.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
