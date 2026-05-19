"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  BookCopy,
  CalendarDays,
  Library,
  PenLine,
  Plus,
  Users,
} from "lucide-react";

import {
  CollaboratorDialog,
  type AccessArea,
  type CollaboratorForm,
  type CollaboratorType,
  type PermissionLevel,
} from "@/components/collaboration/collaborator-dialog";

type AccessCard = {
  area: AccessArea;
  title: string;
  icon: LucideIcon;
};

type CollaboratorRecord = {
  id: string;
  name: string;
  email: string;
  type: CollaboratorType;
  permissions: Record<AccessArea, PermissionLevel>;
};

const accessCards: AccessCard[] = [
  { area: "project", title: "Project Access", icon: BookCopy },
  { area: "calendar", title: "Calendar Access", icon: CalendarDays },
  { area: "library", title: "Library Access", icon: Library },
  { area: "archive", title: "Archives Access", icon: Archive },
];

const initialCollaborators: CollaboratorRecord[] = [
  {
    id: "user-1",
    name: "User 1",
    email: "user1@gulbahartobacco.com",
    type: "Internal",
    permissions: {
      project: "full",
      calendar: "full",
      library: "full",
      archive: "full",
    },
  },
  {
    id: "user-2",
    name: "User 2",
    email: "user2@gulbahartobacco.com",
    type: "Internal",
    permissions: {
      project: "limited",
      calendar: "limited",
      library: "full",
      archive: "full",
    },
  },
  {
    id: "user-3",
    name: "User 3",
    email: "user3@gulbahartobacco.com",
    type: "Internal",
    permissions: {
      project: "limited",
      calendar: "none",
      library: "full",
      archive: "full",
    },
  },
  {
    id: "user-4",
    name: "User 4",
    email: "user4@gulbahartobacco.com",
    type: "Internal",
    permissions: {
      project: "limited",
      calendar: "limited",
      library: "full",
      archive: "full",
    },
  },
  {
    id: "user-5",
    name: "User 5",
    email: "user5@gulbahartobacco.com",
    type: "Internal",
    permissions: {
      project: "none",
      calendar: "none",
      library: "none",
      archive: "none",
    },
  },
  {
    id: "user-6",
    name: "User 6",
    email: "user6@gulbahartobacco.com",
    type: "Internal",
    permissions: {
      project: "limited",
      calendar: "limited",
      library: "limited",
      archive: "limited",
    },
  },
  {
    id: "user-7",
    name: "User 7",
    email: "user7@gulbahartobacco.com",
    type: "Internal",
    permissions: {
      project: "full",
      calendar: "full",
      library: "full",
      archive: "full",
    },
  },
  {
    id: "user-8",
    name: "User 8",
    email: "user8@gulbahartobacco.com",
    type: "Internal",
    permissions: {
      project: "none",
      calendar: "none",
      library: "full",
      archive: "full",
    },
  },
];

const permissionStyles: Record<
  PermissionLevel,
  { box: string; icon: string; label: string }
> = {
  full: {
    box: "bg-[#2f8d5d]",
    icon: "text-white",
    label: "Full Access",
  },
  limited: {
    box: "bg-[#f0a33a]",
    icon: "text-white",
    label: "Limited Access",
  },
  none: {
    box: "bg-[#ff5a58]",
    icon: "text-white",
    label: "No Access",
  },
};

const areaIcons: Record<AccessArea, LucideIcon> = {
  project: BookCopy,
  calendar: CalendarDays,
  library: Library,
  archive: Archive,
};

const areaLabels: Record<AccessArea, string> = {
  project: "Project Access",
  calendar: "Calendar Access",
  library: "Library Access",
  archive: "Archives Access",
};

function getDefaultPermissions(): Record<AccessArea, PermissionLevel> {
  return {
    project: "full",
    calendar: "limited",
    library: "full",
    archive: "limited",
  };
}

function getDefaultForm(): CollaboratorForm {
  return {
    name: "",
    email: "",
    type: "Internal",
    permissions: getDefaultPermissions(),
  };
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function CollaborationWorkspace() {
  const [selectedArea, setSelectedArea] = useState<AccessArea>("project");
  const [collaborators, setCollaborators] =
    useState<CollaboratorRecord[]>(initialCollaborators);
  const [dialogMode, setDialogMode] = useState<"invite" | "edit">("invite");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CollaboratorForm>(getDefaultForm());

  const selectedAccessSummary = useMemo(() => {
    const full = collaborators.filter(
      (collaborator) => collaborator.permissions[selectedArea] === "full",
    ).length;
    const limited = collaborators.filter(
      (collaborator) => collaborator.permissions[selectedArea] === "limited",
    ).length;
    const none = collaborators.length - full - limited;

    return { full, limited, none };
  }, [collaborators, selectedArea]);

  function setFormValue<K extends keyof CollaboratorForm>(
    field: K,
    value: CollaboratorForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setPermissionValue(area: AccessArea, value: PermissionLevel) {
    setForm((current) => ({
      ...current,
      permissions: { ...current.permissions, [area]: value },
    }));
  }

  function openInviteDialog() {
    setDialogMode("invite");
    setEditingId(null);
    setForm(getDefaultForm());
    setDialogOpen(true);
  }

  function openEditDialog(collaborator: CollaboratorRecord) {
    setDialogMode("edit");
    setEditingId(collaborator.id);
    setForm({
      name: collaborator.name,
      email: collaborator.email,
      type: collaborator.type,
      permissions: { ...collaborator.permissions },
    });
    setDialogOpen(true);
  }

  function handleSaveCollaborator() {
    if (!form.name.trim() || !form.email.trim()) {
      return;
    }

    if (dialogMode === "invite") {
      const nextCollaborator: CollaboratorRecord = {
        id: `user-${Date.now()}`,
        name: form.name.trim(),
        email: form.email.trim(),
        type: form.type,
        permissions: { ...form.permissions },
      };

      setCollaborators((current) => [...current, nextCollaborator]);
    } else if (editingId) {
      setCollaborators((current) =>
        current.map((collaborator) =>
          collaborator.id === editingId
            ? {
                ...collaborator,
                name: form.name.trim(),
                email: form.email.trim(),
                type: form.type,
                permissions: { ...form.permissions },
              }
            : collaborator,
        ),
      );
    }

    setDialogOpen(false);
  }

  return (
    <>
      <section className="space-y-6">
        <header className="flex flex-col gap-4">
          <h1 className="text-[42px] font-[600] leading-none tracking-[-0.05em] text-[#0f1411] sm:text-[56px]">
            Collaboration
          </h1>
        </header>

        <section className="rounded-[30px] bg-surface p-6 shadow-[0_22px_60px_rgba(23,39,28,0.06)]">
          <div className="mb-8 flex flex-col gap-3">
            <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#434747]">
              Quick Menu
            </h2>
            <p className="text-[14px] text-[#6f7771]">
              Select an access area to review who can view or manage it.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {accessCards.map((card) => {
              const Icon = card.icon;
              const active = selectedArea === card.area;
              const activeCount = collaborators.filter(
                (collaborator) => collaborator.permissions[card.area] !== "none",
              ).length;

              return (
                <article
                  key={card.area}
                  className={`rounded-[22px] bg-white p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)] transition-colors ${
                    active ? "ring-2 ring-brand/50" : ""
                  }`}
                >
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div className="grid h-16 w-16 place-items-center rounded-[18px] bg-brand-soft text-brand">
                      <Icon className="h-8 w-8" />
                    </div>
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-[#edf4ee] text-brand">
                      <Users className="h-5 w-5" />
                    </div>
                  </div>

                  <h3 className="text-[16px] font-[700] text-[#141915]">
                    {card.title}
                  </h3>
                  <p className="mt-2 text-[13px] text-[#79817b]">
                    {activeCount} collaborators currently assigned
                  </p>

                  <button
                    type="button"
                    onClick={() => setSelectedArea(card.area)}
                    className="mt-5 inline-flex min-h-[42px] w-full items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-6 text-[14px] font-[600] text-white"
                  >
                    View
                  </button>
                </article>
              );
            })}
          </div>

          <div className="mt-10 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#434747]">
                Collaborators
              </h2>
              <p className="mt-2 text-[14px] text-[#6f7771]">
                Current focus: {areaLabels[selectedArea]}. Full:{" "}
                {selectedAccessSummary.full}, Limited:{" "}
                {selectedAccessSummary.limited}, No access:{" "}
                {selectedAccessSummary.none}.
              </p>
            </div>

            <button
              type="button"
              onClick={openInviteDialog}
              className="inline-flex min-h-[42px] items-center justify-center gap-2 self-start rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-6 text-[14px] font-[600] text-white xl:self-auto"
            >
              Invite <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 overflow-hidden rounded-[24px] bg-white shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
            <div className="hidden grid-cols-[minmax(220px,1.25fr)_repeat(4,minmax(68px,84px))_56px] items-center gap-4 border-b border-[#e4e9e4] px-5 py-4 lg:grid">
              <span className="text-[12px] font-[700] uppercase tracking-[0.18em] text-[#818982]">
                Collaborator
              </span>
              {accessCards.map((card) => {
                const Icon = card.icon;
                const active = selectedArea === card.area;

                return (
                  <div
                    key={card.area}
                    className={`grid justify-center text-center ${
                      active ? "text-brand" : "text-[#8b948d]"
                    }`}
                  >
                    <Icon className="mx-auto mb-1 h-4 w-4" />
                    <span className="text-[10px] font-[700] uppercase tracking-[0.16em]">
                      {card.title.split(" ")[0]}
                    </span>
                  </div>
                );
              })}
              <span className="text-right text-[12px] font-[700] uppercase tracking-[0.18em] text-[#818982]">
                Edit
              </span>
            </div>

            <div className="divide-y divide-[#edf1ed]">
              {collaborators.map((collaborator) => (
                <div
                  key={collaborator.id}
                  className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(220px,1.25fr)_repeat(4,minmax(68px,84px))_56px] lg:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[12px] font-[700] ${
                        collaborator.permissions[selectedArea] === "full"
                          ? "bg-[#dff3e7] text-brand"
                          : collaborator.permissions[selectedArea] === "limited"
                            ? "bg-[#fff0da] text-[#d38713]"
                            : "bg-[#ffe4e4] text-[#ef5855]"
                      }`}
                    >
                      {getInitials(collaborator.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-[600] text-[#1f2923]">
                        {collaborator.name}
                      </p>
                      <p className="truncate text-[11px] text-[#56b24c]">
                        {collaborator.type}
                      </p>
                      <p className="truncate text-[11px] text-[#8b948d] lg:hidden">
                        {collaborator.email}
                      </p>
                    </div>
                    <div className="hidden min-w-0 flex-1 lg:block">
                      <div className="mx-6 h-px bg-[#d7ddd6]" />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 lg:contents">
                    {accessCards.map((card) => {
                      const permission = collaborator.permissions[card.area];
                      const styles = permissionStyles[permission];
                      const Icon = areaIcons[card.area];
                      const active = selectedArea === card.area;

                      return (
                        <div
                          key={`${collaborator.id}-${card.area}`}
                          className="flex flex-col items-center gap-1"
                        >
                          <div
                            className={`grid h-8 w-8 place-items-center rounded-md ${styles.box} ${
                              active ? "ring-2 ring-[#d5dfd8]" : ""
                            }`}
                            title={`${card.title}: ${styles.label}`}
                          >
                            <Icon className={`h-4 w-4 ${styles.icon}`} />
                          </div>
                          <span className="text-[10px] text-[#7f877f] lg:hidden">
                            {card.title.split(" ")[0]}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => openEditDialog(collaborator)}
                      className="grid h-9 w-9 place-items-center rounded-full border border-[#d9dfda] text-[#1f2923] transition-colors hover:border-brand hover:text-brand"
                      aria-label={`Edit ${collaborator.name}`}
                    >
                      <PenLine className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </section>

      <CollaboratorDialog
        isOpen={dialogOpen}
        mode={dialogMode}
        form={form}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSaveCollaborator}
        onChange={setFormValue}
        onPermissionChange={setPermissionValue}
      />
    </>
  );
}
