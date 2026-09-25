"use server";

import { randomUUID } from "node:crypto";

import { Prisma, ProjectTrackerColumnType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  PROJECT_TRACKER_FIELD_REGISTRY,
  assertProjectOptionAccessible,
  getProjectTrackerTrash,
  getProjectTrackerWorkspace,
  getSourceValueForCell,
  getTrackerColumnAndRow,
  matchProjectTrackerField,
  normalizeTrackerCellValue,
  normalizeTrackerLabel,
  recordTrackerActivity,
  requireEditableTracker,
  validateTrackerImport,
  type TrackerCellValue,
  type TrackerImportColumn,
  type TrackerProjectKind,
  type ProjectTrackerTrashItemRecord,
} from "@/lib/project-tracker";
import { prisma, withPrismaRetry } from "@/lib/prisma";

type ActionResult =
  | { workspace: Awaited<ReturnType<typeof getProjectTrackerWorkspace>>; message?: string }
  | { ok: true; message?: string }
  | { error: string };

type TrashActionResult =
  | { items: ProjectTrackerTrashItemRecord[] }
  | { error: string };

type TrackerLayoutColumn = {
  key: string | null;
  name: string;
  frozen: boolean;
};

const BLANK_TRACKER_COLUMNS: TrackerLayoutColumn[] = [
  { key: "project.name", name: "Project", frozen: true },
];

const DEFAULT_TRACKER_LAYOUT: TrackerLayoutColumn[] = [
  ...BLANK_TRACKER_COLUMNS,
  { key: "project.owner", name: "Project Owner", frozen: false },
  { key: "project.status", name: "Status", frozen: false },
  { key: "project.deadline", name: "Deadline", frozen: false },
  { key: "project.client", name: "Client", frozen: false },
  { key: "project.vendor", name: "Vendor", frozen: false },
  { key: "project.priority", name: "Priority", frozen: false },
  { key: "project.deliverables", name: "Deliverables", frozen: false },
  { key: null, name: "Director Comment", frozen: false },
];

function asErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Project Tracker could not be updated.";
  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error.message.includes("Invalid `") ||
    error.message.includes("Transaction API error") ||
    error.message.includes("expired transaction")
  ) {
    return "Project Tracker could not save this change. Please try again.";
  }
  return error.message;
}

function chunksOf<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function jsonValue(value: Exclude<TrackerCellValue, null>) {
  return value as Prisma.InputJsonValue;
}

function fieldForKey(key: string | null | undefined) {
  if (!key) return null;
  return PROJECT_TRACKER_FIELD_REGISTRY.find((field) => field.key === key) ?? null;
}

function assertColumnType(value: ProjectTrackerColumnType) {
  if (!Object.values(ProjectTrackerColumnType).includes(value)) {
    throw new Error("Choose a valid column type.");
  }
  return value;
}

async function finish(user: Awaited<ReturnType<typeof requireUser>>, message?: string) {
  revalidatePath("/project-tracker");
  return { workspace: await getProjectTrackerWorkspace(user), message } as const;
}

function complete(message?: string) {
  return { ok: true as const, message };
}

export async function initializeProjectTrackerAction(
  mode: "blank" | "layout",
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const existingColumns = await prisma.projectTrackerColumn.count({
      where: { trackerId: tracker.id, deletedAt: null },
    });
    if (existingColumns > 0) return finish(user);

    const columns = mode === "layout" ? DEFAULT_TRACKER_LAYOUT : BLANK_TRACKER_COLUMNS;

    await withPrismaRetry(() =>
      prisma.$transaction(async (transaction) => {
        for (const [index, column] of columns.entries()) {
          const field = fieldForKey(column.key);
          await transaction.projectTrackerColumn.create({
            data: {
              trackerId: tracker.id,
              name: column.name,
              type: field?.type ?? ProjectTrackerColumnType.NOTES,
              sourceFieldKey: field?.key ?? null,
              sortOrder: index,
              width: field?.key === "project.deliverables" ? 240 : 180,
              frozen: column.frozen,
            },
          });
        }
        await transaction.projectTrackerActivity.create({
          data: {
            trackerId: tracker.id,
            actorId: user.id,
            action: "TRACKER_INITIALIZED",
            details: {
              summary:
                mode === "layout"
                  ? "Started with the Marketing layout"
                  : "Started a blank tracker",
            },
          },
        });
      }),
    );

    return finish(user, mode === "layout" ? "Layout ready." : "Blank tracker ready.");
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function applyProjectTrackerLayoutAction(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const workspace = await getProjectTrackerWorkspace(user);
    const missingColumns = DEFAULT_TRACKER_LAYOUT.filter((layoutColumn) =>
      layoutColumn.key
        ? !workspace.columns.some((column) => column.sourceFieldKey === layoutColumn.key)
        : !workspace.columns.some(
            (column) =>
              !column.sourceFieldKey &&
              normalizeTrackerLabel(column.name) === normalizeTrackerLabel(layoutColumn.name),
          ),
    );

    if (!missingColumns.length) {
      return finish(user, "The existing layout is already applied.");
    }

    await withPrismaRetry(() =>
      prisma.$transaction(async (transaction) => {
        let nextSortOrder = workspace.columns.length
          ? Math.max(...workspace.columns.map((column) => column.sortOrder)) + 1
          : 0;

        for (const layoutColumn of missingColumns) {
          const field = fieldForKey(layoutColumn.key);
          const column = await transaction.projectTrackerColumn.create({
            data: {
              trackerId: tracker.id,
              name: layoutColumn.name,
              type: field?.type ?? ProjectTrackerColumnType.NOTES,
              sourceFieldKey: field?.key ?? null,
              sortOrder: nextSortOrder++,
              width: field?.key === "project.deliverables" ? 240 : 180,
              frozen: layoutColumn.frozen,
            },
          });

          if (field) {
            const lastSyncedAt = new Date();
            const populatedCells = workspace.rows.flatMap((row) => {
              const value = row.project?.fields[field.key] ?? null;
              return value === null || (Array.isArray(value) && value.length === 0)
                ? []
                : [{
                    rowId: row.id,
                    columnId: column.id,
                    value: jsonValue(value),
                    lastSyncedValue: jsonValue(value),
                    lastSyncedAt,
                  }];
            });
            if (populatedCells.length) {
              await transaction.projectTrackerCell.createMany({ data: populatedCells });
            }
          }
        }

        await transaction.projectTrackerActivity.create({
          data: {
            trackerId: tracker.id,
            actorId: user.id,
            action: "LAYOUT_APPLIED",
            details: {
              summary: `Applied the existing layout (${missingColumns.length} ${missingColumns.length === 1 ? "column" : "columns"} added)`,
            },
          },
        });
      }),
    );

    return finish(
      user,
      `Existing layout applied. ${missingColumns.length} ${missingColumns.length === 1 ? "column" : "columns"} added.`,
    );
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function resetProjectTrackerToBlankAction(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const projectField = fieldForKey("project.name");
    const currentSettings =
      tracker.settings && typeof tracker.settings === "object" && !Array.isArray(tracker.settings)
        ? (tracker.settings as Prisma.JsonObject)
        : {};
    const settingsWithoutWorkbook = { ...currentSettings };
    delete settingsWithoutWorkbook.fortuneSheet;
    delete settingsWithoutWorkbook.spreadsheet;

    await withPrismaRetry(() =>
      prisma.$transaction(async (transaction) => {
        await transaction.projectTrackerRow.deleteMany({ where: { trackerId: tracker.id } });
        await transaction.projectTrackerColumn.deleteMany({ where: { trackerId: tracker.id } });
        await transaction.projectTracker.update({
          where: { id: tracker.id },
          data: { settings: settingsWithoutWorkbook },
        });
        await transaction.projectTrackerColumn.create({
          data: {
            trackerId: tracker.id,
            name: "Project",
            type: projectField?.type ?? ProjectTrackerColumnType.PROJECT,
            sourceFieldKey: projectField?.key ?? "project.name",
            sortOrder: 0,
            width: 180,
            frozen: true,
          },
        });
        await transaction.projectTrackerActivity.create({
          data: {
            trackerId: tracker.id,
            actorId: user.id,
            action: "TRACKER_RESET",
            details: { summary: "Reset the tracker to a blank layout" },
          },
        });
      }),
    );

    return finish(user, "Blank tracker ready.");
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function addProjectTrackerColumnAction(input: {
  id?: string;
  name: string;
  type: ProjectTrackerColumnType;
  sourceFieldKey?: string | null;
  beforeColumnId?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const name = input.name.trim();
    if (!name) throw new Error("Enter a column name.");
    if (name.length > 120) throw new Error("Column names must be 120 characters or fewer.");
    const sourceField = fieldForKey(input.sourceFieldKey);
    const lastColumn = await prisma.projectTrackerColumn.findFirst({
      where: { trackerId: tracker.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const beforeColumn = input.beforeColumnId
      ? await prisma.projectTrackerColumn.findFirst({
          where: { id: input.beforeColumnId, trackerId: tracker.id, deletedAt: null },
          select: { sortOrder: true },
        })
      : null;
    await withPrismaRetry(() => prisma.$transaction(async (transaction) => {
      const sortOrder = beforeColumn?.sortOrder ?? (lastColumn?.sortOrder ?? -1) + 1;
      if (beforeColumn) {
        await transaction.projectTrackerColumn.updateMany({
          where: { trackerId: tracker.id, sortOrder: { gte: sortOrder } },
          data: { sortOrder: { increment: 1 } },
        });
      }
      const created = await transaction.projectTrackerColumn.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          trackerId: tracker.id,
          name,
          type: sourceField?.type ?? assertColumnType(input.type),
          sourceFieldKey: sourceField?.key ?? null,
          sortOrder,
          width: sourceField?.type === ProjectTrackerColumnType.LONG_TEXT ? 260 : 180,
        },
      });
      await transaction.projectTrackerActivity.create({
        data: {
          trackerId: tracker.id,
          actorId: user.id,
          action: "COLUMN_ADDED",
          details: { summary: `Added “${name}”` },
          columnId: created.id,
        },
      });
      return created;
    }));
    return complete("Column added.");
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function updateProjectTrackerColumnAction(input: {
  columnId: string;
  name?: string;
  type?: ProjectTrackerColumnType;
  sourceFieldKey?: string | null;
  hidden?: boolean;
  frozen?: boolean;
  width?: number;
  move?: -1 | 1;
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const column = await prisma.projectTrackerColumn.findFirst({
      where: { id: input.columnId, trackerId: tracker.id, deletedAt: null },
    });
    if (!column) throw new Error("That column no longer exists.");
    const data: Prisma.ProjectTrackerColumnUpdateInput = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error("Column names cannot be empty.");
      data.name = name.slice(0, 120);
    }
    if (input.type !== undefined) data.type = assertColumnType(input.type);
    if (input.sourceFieldKey !== undefined) {
      const field = fieldForKey(input.sourceFieldKey);
      data.sourceFieldKey = field?.key ?? null;
      if (field) data.type = field.type;
    }
    if (input.hidden !== undefined) data.hidden = input.hidden;
    if (input.frozen !== undefined) data.frozen = input.frozen;
    if (input.width !== undefined) data.width = Math.max(110, Math.min(480, Math.round(input.width)));

    await withPrismaRetry(() =>
      prisma.$transaction(async (transaction) => {
        if (input.move) {
          const neighbor = await transaction.projectTrackerColumn.findFirst({
            where: {
              trackerId: tracker.id,
              deletedAt: null,
              ...(input.move < 0
                ? { sortOrder: { lt: column.sortOrder } }
                : { sortOrder: { gt: column.sortOrder } }),
            },
            orderBy: { sortOrder: input.move < 0 ? "desc" : "asc" },
          });
          if (neighbor) {
            await transaction.projectTrackerColumn.update({
              where: { id: neighbor.id },
              data: { sortOrder: column.sortOrder },
            });
            data.sortOrder = neighbor.sortOrder;
          }
        }
        await transaction.projectTrackerColumn.update({ where: { id: column.id }, data });
        await transaction.projectTrackerActivity.create({
          data: {
            trackerId: tracker.id,
            actorId: user.id,
            columnId: column.id,
            action: "COLUMN_UPDATED",
            details: { summary: `Updated “${column.name}”` },
          },
        });
      }),
    );
    return complete();
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function deleteProjectTrackerColumnAction(columnId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const column = await prisma.projectTrackerColumn.findFirst({
      where: { id: columnId, trackerId: tracker.id, deletedAt: null },
    });
    if (!column) throw new Error("That column no longer exists.");
    await prisma.$transaction([
      prisma.projectTrackerActivity.create({
        data: {
          trackerId: tracker.id,
          actorId: user.id,
          columnId: column.id,
          action: "COLUMN_DELETED",
          details: { summary: `Deleted “${column.name}”` },
        },
      }),
      prisma.projectTrackerColumn.update({
        where: { id: column.id },
        data: { deletedAt: new Date() },
      }),
    ]);
    return complete("Column moved to Bin.");
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function addProjectTrackerRowAction(input?: { id?: string; beforeRowId?: string }): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const lastRow = await prisma.projectTrackerRow.findFirst({
      where: { trackerId: tracker.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const beforeRow = input?.beforeRowId
      ? await prisma.projectTrackerRow.findFirst({
          where: { id: input.beforeRowId, trackerId: tracker.id, deletedAt: null },
          select: { sortOrder: true },
        })
      : null;
    await withPrismaRetry(() => prisma.$transaction(async (transaction) => {
      const sortOrder = beforeRow?.sortOrder ?? (lastRow?.sortOrder ?? -1) + 1;
      if (beforeRow) {
        await transaction.projectTrackerRow.updateMany({
          where: { trackerId: tracker.id, sortOrder: { gte: sortOrder } },
          data: { sortOrder: { increment: 1 } },
        });
      }
      const created = await transaction.projectTrackerRow.create({
        data: {
          ...(input?.id ? { id: input.id } : {}),
          trackerId: tracker.id,
          sortOrder,
        },
      });
      await transaction.projectTrackerActivity.create({
        data: {
          trackerId: tracker.id,
          actorId: user.id,
          action: "ROW_ADDED",
          details: { summary: "Added a row" },
          rowId: created.id,
        },
      });
      return created;
    }));
    return complete();
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function duplicateProjectTrackerRowAction(
  rowId: string,
  input?: { id?: string },
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const source = await prisma.projectTrackerRow.findFirst({
      where: { id: rowId, trackerId: tracker.id, deletedAt: null },
      include: { cells: true },
    });
    if (!source) throw new Error("That row no longer exists.");
    const lastRow = await prisma.projectTrackerRow.findFirst({
      where: { trackerId: tracker.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const row = await prisma.projectTrackerRow.create({
      data: {
        ...(input?.id ? { id: input.id } : {}),
        trackerId: tracker.id,
        sortOrder: (lastRow?.sortOrder ?? -1) + 1,
        structuredProjectId: source.structuredProjectId,
        flexibleProjectId: source.flexibleProjectId,
        linkedAt: source.linkedAt,
        cells: {
          create: source.cells.map((cell) => ({
            columnId: cell.columnId,
            value: cell.value ?? Prisma.JsonNull,
            isLocalOverride: cell.isLocalOverride,
            lastSyncedValue: cell.lastSyncedValue ?? Prisma.JsonNull,
            lastSyncedAt: cell.lastSyncedAt,
          })),
        },
      },
    });
    await recordTrackerActivity({
      trackerId: tracker.id,
      actorId: user.id,
      action: "ROW_DUPLICATED",
      summary: "Duplicated a row",
      rowId: row.id,
    });
    return complete("Row duplicated.");
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function moveProjectTrackerRowAction(rowId: string, direction: -1 | 1): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const row = await prisma.projectTrackerRow.findFirst({
      where: { id: rowId, trackerId: tracker.id, deletedAt: null },
    });
    if (!row) throw new Error("That row no longer exists.");
    const neighbor = await prisma.projectTrackerRow.findFirst({
      where: {
        trackerId: tracker.id,
        deletedAt: null,
        ...(direction < 0 ? { sortOrder: { lt: row.sortOrder } } : { sortOrder: { gt: row.sortOrder } }),
      },
      orderBy: { sortOrder: direction < 0 ? "desc" : "asc" },
    });
    if (neighbor) {
      await prisma.$transaction([
        prisma.projectTrackerRow.update({ where: { id: neighbor.id }, data: { sortOrder: row.sortOrder } }),
        prisma.projectTrackerRow.update({ where: { id: row.id }, data: { sortOrder: neighbor.sortOrder } }),
      ]);
    }
    return complete();
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function deleteProjectTrackerRowsAction(rowIds: string[]): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const ids = Array.from(new Set(rowIds.filter(Boolean)));
    if (!ids.length) throw new Error("Select at least one row.");
    const result = await prisma.projectTrackerRow.updateMany({
      where: { trackerId: tracker.id, id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await recordTrackerActivity({
      trackerId: tracker.id,
      actorId: user.id,
      action: "ROW_DELETED",
      summary: `Deleted ${result.count} ${result.count === 1 ? "row" : "rows"}`,
    });
    return complete(`${result.count} ${result.count === 1 ? "row" : "rows"} moved to Bin.`);
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function getProjectTrackerTrashAction(): Promise<TrashActionResult> {
  try {
    const user = await requireUser();
    return { items: await getProjectTrackerTrash(user) };
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function restoreProjectTrackerItemAction(input: {
  id: string;
  kind: "row" | "column";
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);

    if (input.kind === "column") {
      const column = await prisma.projectTrackerColumn.findFirst({
        where: { id: input.id, trackerId: tracker.id, deletedAt: { not: null } },
        select: { id: true, name: true },
      });
      if (!column) throw new Error("That deleted column is no longer in Bin.");
      await prisma.$transaction([
        prisma.projectTrackerColumn.update({
          where: { id: column.id },
          data: { deletedAt: null },
        }),
        prisma.projectTrackerActivity.create({
          data: {
            trackerId: tracker.id,
            actorId: user.id,
            columnId: column.id,
            action: "COLUMN_RESTORED",
            details: { summary: `Restored “${column.name}” from Bin` },
          },
        }),
      ]);
      return finish(user, `“${column.name}” restored.`);
    }

    const row = await prisma.projectTrackerRow.findFirst({
      where: { id: input.id, trackerId: tracker.id, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!row) throw new Error("That deleted row is no longer in Bin.");
    await prisma.$transaction([
      prisma.projectTrackerRow.update({
        where: { id: row.id },
        data: { deletedAt: null },
      }),
      prisma.projectTrackerActivity.create({
        data: {
          trackerId: tracker.id,
          actorId: user.id,
          rowId: row.id,
          action: "ROW_RESTORED",
          details: { summary: "Restored a row from Bin" },
        },
      }),
    ]);
    return finish(user, "Row restored.");
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function saveProjectTrackerCellAction(input: {
  rowId: string;
  columnId: string;
  value: TrackerCellValue;
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const { row, column } = await getTrackerColumnAndRow(tracker.id, input.rowId, input.columnId);
    const value = normalizeTrackerCellValue(input.value);
    const operations: Prisma.PrismaPromise<unknown>[] = [];
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      operations.push(
        prisma.projectTrackerCell.deleteMany({
          where: { rowId: row.id, columnId: column.id },
        }),
      );
    } else {
      operations.push(
        prisma.projectTrackerCell.upsert({
          where: { rowId_columnId: { rowId: row.id, columnId: column.id } },
          create: {
            rowId: row.id,
            columnId: column.id,
            value: jsonValue(value),
            isLocalOverride: Boolean(column.sourceFieldKey),
          },
          update: {
            value: jsonValue(value),
            isLocalOverride: Boolean(column.sourceFieldKey),
          },
        }),
      );
    }
    operations.push(
      prisma.projectTrackerActivity.create({
        data: {
          trackerId: tracker.id,
          actorId: user.id,
          action: "CELL_UPDATED",
          details: { summary: `Updated “${column.name}”` },
          rowId: row.id,
          columnId: column.id,
        },
      }),
    );
    await prisma.$transaction(operations);
    return complete();
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function saveProjectTrackerCellsAction(input: {
  changes: Array<{ rowId: string; columnId: string; value: TrackerCellValue }>;
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    if (input.changes.length > 500) throw new Error("Save up to 500 tracker cells in one batch.");
    const deduplicated = new Map(
      input.changes.map((change) => [`${change.rowId}:${change.columnId}`, change]),
    );
    const changes = [...deduplicated.values()];
    if (!changes.length) return complete();
    const rowIds = Array.from(new Set(changes.map((change) => change.rowId)));
    const columnIds = Array.from(new Set(changes.map((change) => change.columnId)));
    const [rows, columns] = await Promise.all([
      prisma.projectTrackerRow.findMany({
        where: { trackerId: tracker.id, id: { in: rowIds }, deletedAt: null },
        select: { id: true },
      }),
      prisma.projectTrackerColumn.findMany({
        where: { trackerId: tracker.id, id: { in: columnIds }, deletedAt: null },
        select: { id: true, sourceFieldKey: true },
      }),
    ]);
    const validRows = new Set(rows.map((row) => row.id));
    const columnMap = new Map(columns.map((column) => [column.id, column]));
    if (validRows.size !== rowIds.length || columnMap.size !== columnIds.length) {
      throw new Error("One or more tracker cells no longer exist.");
    }
    const operations: Prisma.PrismaPromise<unknown>[] = changes.map((change) => {
      const value = normalizeTrackerCellValue(change.value);
      const column = columnMap.get(change.columnId)!;
      return value === null || (Array.isArray(value) && value.length === 0)
        ? prisma.projectTrackerCell.deleteMany({ where: { rowId: change.rowId, columnId: change.columnId } })
        : prisma.projectTrackerCell.upsert({
            where: { rowId_columnId: { rowId: change.rowId, columnId: change.columnId } },
            create: {
              rowId: change.rowId,
              columnId: change.columnId,
              value: jsonValue(value),
              isLocalOverride: Boolean(column.sourceFieldKey),
            },
            update: { value: jsonValue(value), isLocalOverride: Boolean(column.sourceFieldKey) },
          });
    });
    operations.push(prisma.projectTrackerActivity.create({
      data: {
        trackerId: tracker.id,
        actorId: user.id,
        action: changes.length === 1 ? "CELL_UPDATED" : "CELLS_UPDATED",
        rowId: rowIds.length === 1 ? rowIds[0] : undefined,
        columnId: columnIds.length === 1 ? columnIds[0] : undefined,
        details: { summary: changes.length === 1 ? "Updated a tracker value" : `Updated ${changes.length} tracker values` },
      },
    }));
    await withPrismaRetry(() => prisma.$transaction(operations));
    return complete();
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function reorderProjectTrackerRowsAction(rowIds: string[]): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const uniqueIds = Array.from(new Set(rowIds));
    const activeRows = await prisma.projectTrackerRow.findMany({
      where: { trackerId: tracker.id, deletedAt: null },
      select: { id: true },
    });
    if (uniqueIds.length !== activeRows.length || activeRows.some((row) => !uniqueIds.includes(row.id))) {
      throw new Error("The tracker changed while rows were being sorted. Refresh and try again.");
    }
    await withPrismaRetry(() => prisma.$transaction([
      ...uniqueIds.map((id, sortOrder) => prisma.projectTrackerRow.update({ where: { id }, data: { sortOrder } })),
      prisma.projectTrackerActivity.create({
        data: {
          trackerId: tracker.id,
          actorId: user.id,
          action: "ROWS_SORTED",
          details: { summary: `Sorted ${uniqueIds.length} tracker rows` },
        },
      }),
    ]));
    return complete();
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function saveProjectTrackerWorkbookAction(input: {
  workbook: unknown;
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const serialized = JSON.stringify(input.workbook);
    if (serialized.length > 4_000_000) {
      throw new Error("This workbook is too large to save. Remove large images or unused sheets and try again.");
    }

    const workbook = JSON.parse(serialized) as unknown;
    if (!workbook || typeof workbook !== "object" || Array.isArray(workbook)) {
      throw new Error("The workbook contains invalid data.");
    }
    const workbookRecord = workbook as Record<string, unknown>;
    const sheets = workbookRecord.sheets;
    if (workbookRecord.version !== 2 || !Array.isArray(sheets) || sheets.length < 1 || sheets.length > 20) {
      throw new Error("The workbook must contain between 1 and 20 worksheets.");
    }
    if (sheets.some((sheet) => !sheet || typeof sheet !== "object" || Array.isArray(sheet))) {
      throw new Error("The workbook contains invalid worksheet data.");
    }

    const currentSettings =
      tracker.settings && typeof tracker.settings === "object" && !Array.isArray(tracker.settings)
        ? (tracker.settings as Prisma.JsonObject)
        : {};
    const nextSettings = { ...currentSettings };
    delete nextSettings.fortuneSheet;

    await prisma.projectTracker.update({
      where: { id: tracker.id },
      data: {
        settings: {
          ...nextSettings,
          spreadsheet: {
            version: 2,
            workbook: workbook as Prisma.InputJsonValue,
          },
        },
      },
    });

    return complete();
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function linkProjectTrackerRowAction(input: {
  rowId: string;
  kind: TrackerProjectKind;
  projectId: string;
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const project = await assertProjectOptionAccessible(user, input.kind, input.projectId);
    const row = await prisma.projectTrackerRow.findFirst({
      where: { id: input.rowId, trackerId: tracker.id, deletedAt: null },
      include: { cells: true },
    });
    if (!row) throw new Error("That row no longer exists.");
    const columns = await prisma.projectTrackerColumn.findMany({
      where: { trackerId: tracker.id, deletedAt: null, sourceFieldKey: { not: null } },
    });
    const cells = new Map(row.cells.map((cell) => [cell.columnId, cell]));

    await withPrismaRetry(() =>
      prisma.$transaction(async (transaction) => {
        await transaction.projectTrackerRow.update({
          where: { id: row.id },
          data: {
            structuredProjectId: input.kind === "structured" ? project.id : null,
            flexibleProjectId: input.kind === "flexible" ? project.id : null,
            linkedAt: new Date(),
          },
        });

        for (const column of columns) {
          if (!column.sourceFieldKey) continue;
          const sourceValue = normalizeTrackerCellValue(project.fields[column.sourceFieldKey]);
          if (sourceValue === null || (Array.isArray(sourceValue) && sourceValue.length === 0)) continue;
          const cell = cells.get(column.id);
          const currentValue = normalizeTrackerCellValue(cell?.value);
          const empty = currentValue === null || (Array.isArray(currentValue) && currentValue.length === 0);
          const equal = JSON.stringify(currentValue) === JSON.stringify(sourceValue);
          if (!empty && !equal) continue;
          await transaction.projectTrackerCell.upsert({
            where: { rowId_columnId: { rowId: row.id, columnId: column.id } },
            create: {
              rowId: row.id,
              columnId: column.id,
              value: jsonValue(sourceValue),
              lastSyncedValue: jsonValue(sourceValue),
              lastSyncedAt: new Date(),
            },
            update: {
              value: jsonValue(sourceValue),
              lastSyncedValue: jsonValue(sourceValue),
              lastSyncedAt: new Date(),
              isLocalOverride: false,
            },
          });
        }

        await transaction.projectTrackerActivity.create({
          data: {
            trackerId: tracker.id,
            rowId: row.id,
            actorId: user.id,
            action: "PROJECT_LINKED",
            details: { summary: `Linked “${project.name}”`, projectKind: project.kind, projectId: project.id },
          },
        });
      }),
    );
    return complete(`${project.name} connected.`);
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function unlinkProjectTrackerRowAction(rowId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const row = await prisma.projectTrackerRow.findFirst({
      where: { id: rowId, trackerId: tracker.id, deletedAt: null },
    });
    if (!row) throw new Error("That row no longer exists.");
    await prisma.$transaction([
      prisma.projectTrackerRow.update({
        where: { id: row.id },
        data: { structuredProjectId: null, flexibleProjectId: null, linkedAt: null },
      }),
      prisma.projectTrackerActivity.create({
        data: {
          trackerId: tracker.id,
          rowId: row.id,
          actorId: user.id,
          action: "PROJECT_UNLINKED",
          details: { summary: "Disconnected the Flux project" },
        },
      }),
    ]);
    return complete("Project disconnected. Tracker values were kept.");
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function resolveProjectTrackerCellAction(input: {
  rowId: string;
  columnId: string;
  resolution: "use-source" | "keep-local";
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const { row, column } = await getTrackerColumnAndRow(tracker.id, input.rowId, input.columnId);
    if (!column.sourceFieldKey) throw new Error("That column is not connected to Flux.");
    const cell = row.cells[0];
    if (input.resolution === "keep-local") {
      if (!cell) throw new Error("There is no tracker value to keep.");
      await prisma.projectTrackerCell.update({
        where: { id: cell.id },
        data: { isLocalOverride: true },
      });
      await recordTrackerActivity({
        trackerId: tracker.id,
        actorId: user.id,
        action: "LOCAL_VALUE_KEPT",
        summary: `Kept the tracker value for “${column.name}”`,
        rowId: row.id,
        columnId: column.id,
      });
      return complete("Tracker value kept as a local override.");
    }

    const sourceValue = await getSourceValueForCell(user, row, column.sourceFieldKey);
    if (sourceValue === null || (Array.isArray(sourceValue) && sourceValue.length === 0)) {
      throw new Error("Flux does not currently have a value for this field.");
    }
    await prisma.projectTrackerCell.upsert({
      where: { rowId_columnId: { rowId: row.id, columnId: column.id } },
      create: {
        rowId: row.id,
        columnId: column.id,
        value: jsonValue(sourceValue),
        lastSyncedValue: jsonValue(sourceValue),
        lastSyncedAt: new Date(),
      },
      update: {
        value: jsonValue(sourceValue),
        lastSyncedValue: jsonValue(sourceValue),
        lastSyncedAt: new Date(),
        isLocalOverride: false,
      },
    });
    await recordTrackerActivity({
      trackerId: tracker.id,
      actorId: user.id,
      action: "SOURCE_VALUE_ACCEPTED",
      summary: `Used the Flux value for “${column.name}”`,
      rowId: row.id,
      columnId: column.id,
    });
    return complete("Flux value applied.");
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function importProjectTrackerAction(input: {
  columns: TrackerImportColumn[];
  rows: TrackerCellValue[][];
  fileName: string;
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const tracker = await requireEditableTracker(user);
    const parsed = validateTrackerImport(input.columns, input.rows);
    const existingColumns = await prisma.projectTrackerColumn.findMany({
      where: { trackerId: tracker.id, deletedAt: null },
      orderBy: { sortOrder: "asc" },
    });
    const existingRows = await prisma.projectTrackerRow.findMany({
      where: { trackerId: tracker.id, deletedAt: null },
      orderBy: { sortOrder: "desc" },
      select: {
        id: true,
        sortOrder: true,
        structuredProjectId: true,
        flexibleProjectId: true,
        _count: { select: { cells: true } },
      },
    });

    const populatedRows = existingRows.filter(
      (row) => row.structuredProjectId || row.flexibleProjectId || row._count.cells > 0,
    );
    const blankRowIds = existingRows
      .filter((row) => !row.structuredProjectId && !row.flexibleProjectId && row._count.cells === 0)
      .map((row) => row.id);
    const usedColumnIds = new Set<string>();
    const reorderedColumns: Array<{ id: string; sortOrder: number }> = [];
    const newColumns: Prisma.ProjectTrackerColumnCreateManyInput[] = [];
    const columnIds = parsed.columns.map((importedColumn, index) => {
      const existing = existingColumns.find(
        (column) =>
          !usedColumnIds.has(column.id) &&
          normalizeTrackerLabel(column.name) === normalizeTrackerLabel(importedColumn.name),
      );
      if (existing) {
        usedColumnIds.add(existing.id);
        reorderedColumns.push({ id: existing.id, sortOrder: index });
        return existing.id;
      }

      const id = randomUUID();
      newColumns.push({
        id,
        trackerId: tracker.id,
        name: importedColumn.name,
        type: importedColumn.type,
        sourceFieldKey: importedColumn.sourceFieldKey,
        sortOrder: index,
        frozen: importedColumn.sourceFieldKey === "project.name" && existingColumns.length === 0,
      });
      return id;
    });
    existingColumns
      .filter((column) => !usedColumnIds.has(column.id))
      .forEach((column, index) => {
        reorderedColumns.push({ id: column.id, sortOrder: parsed.columns.length + index });
      });

    const nextRowOrder = (populatedRows[0]?.sortOrder ?? -1) + 1;
    const newRows = parsed.rows.map((_, index) => ({
      id: randomUUID(),
      trackerId: tracker.id,
      sortOrder: nextRowOrder + index,
    }));
    const newCells: Prisma.ProjectTrackerCellCreateManyInput[] = [];
    for (const [rowIndex, importedRow] of parsed.rows.entries()) {
      for (const [columnIndex, value] of importedRow.entries()) {
        if (value === null || (Array.isArray(value) && value.length === 0)) continue;
        newCells.push({
          id: randomUUID(),
          rowId: newRows[rowIndex].id,
          columnId: columnIds[columnIndex],
          value: jsonValue(value),
        });
      }
    }

    await withPrismaRetry(() => {
      const operations: Prisma.PrismaPromise<unknown>[] = [];
      if (blankRowIds.length) {
        operations.push(prisma.projectTrackerRow.deleteMany({ where: { id: { in: blankRowIds } } }));
      }
      for (const column of reorderedColumns) {
        operations.push(prisma.projectTrackerColumn.update({
          where: { id: column.id },
          data: { sortOrder: column.sortOrder },
        }));
      }
      for (const columnBatch of chunksOf(newColumns, 100)) {
        operations.push(prisma.projectTrackerColumn.createMany({ data: columnBatch }));
      }
      for (const rowBatch of chunksOf(newRows, 1_000)) {
        operations.push(prisma.projectTrackerRow.createMany({ data: rowBatch }));
      }
      for (const cellBatch of chunksOf(newCells, 2_000)) {
        operations.push(prisma.projectTrackerCell.createMany({ data: cellBatch }));
      }
      operations.push(
        prisma.projectTrackerActivity.create({
          data: {
            trackerId: tracker.id,
            actorId: user.id,
            action: "IMPORT_COMPLETED",
            details: {
              summary: `Imported ${parsed.rows.length} rows from ${input.fileName || "a spreadsheet"}`,
              rowCount: parsed.rows.length,
              columnCount: parsed.columns.length,
            },
          },
        }),
      );
      return prisma.$transaction(operations);
    });

    const connectedColumns = parsed.columns.filter((column) => column.sourceFieldKey).length;
    const linkedMessage = connectedColumns > 0
      ? `${connectedColumns} ${connectedColumns === 1 ? "column was" : "columns were"} matched to Flux fields.`
      : "No columns were auto-linked to Flux; every imported value was kept as spreadsheet data.";
    return finish(
      user,
      `Imported ${parsed.rows.length} rows across ${parsed.columns.length} ${parsed.columns.length === 1 ? "column" : "columns"}. ${linkedMessage}`,
    );
  } catch (error) {
    return { error: asErrorMessage(error) };
  }
}

export async function suggestProjectTrackerColumnAction(name: string) {
  const user = await requireUser();
  if (!user) return null;
  const match = matchProjectTrackerField(name);
  return match
    ? { key: match.key, label: match.label, type: match.type, description: match.description }
    : null;
}
