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

import { saveCollaboratorAction } from "@/app/collaboration/actions";
import {
  CollaboratorDialog,
  type AccessArea,
  type CollaboratorForm,
  type PermissionLevel,
} from "@/components/collaboration/collaborator-dialog";
import {
  MotionItem,
  MotionSection,
  MotionStaggerGroup,
} from "@/components/motion/motion-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { CollaboratorRecord } from "@/lib/collaboration";
import { cn } from "@/lib/utils";

type AccessCard = {
  area: AccessArea;
  title: string;
  icon: LucideIcon;
};

const accessCards: AccessCard[] = [
  { area: "project", title: "Project Access", icon: BookCopy },
  { area: "calendar", title: "Calendar Access", icon: CalendarDays },
  { area: "library", title: "Library Access", icon: Library },
  { area: "archive", title: "Archives Access", icon: Archive },
];

const permissionStyles: Record<
  PermissionLevel,
  { box: string; icon: string; label: string; badge: string }
> = {
  full: {
    box: "bg-[#2f8d5d]",
    icon: "text-white",
    label: "Full Access",
    badge: "border-[#d6e8dd] bg-[#edf8f1] text-[#2f8d5d]",
  },
  limited: {
    box: "bg-[#f0a33a]",
    icon: "text-white",
    label: "Limited Access",
    badge: "border-[#f7dfb6] bg-[#fff4df] text-[#bb7d1b]",
  },
  none: {
    box: "bg-[#ff5a58]",
    icon: "text-white",
    label: "No Access",
    badge: "border-[#f2cccc] bg-[#fff0ef] text-[#d65250]",
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

const permissionOrder: PermissionLevel[] = ["full", "limited", "none"];

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

type CollaborationWorkspaceProps = {
  initialCollaborators: CollaboratorRecord[];
};

export function CollaborationWorkspace({
  initialCollaborators,
}: CollaborationWorkspaceProps) {
  const [selectedArea, setSelectedArea] = useState<AccessArea>("project");
  const [collaborators, setCollaborators] = useState<CollaboratorRecord[]>(initialCollaborators);
  const [dialogMode, setDialogMode] = useState<"invite" | "edit">("invite");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CollaboratorForm>(getDefaultForm());
  const [dialogError, setDialogError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [pageNotice, setPageNotice] = useState<string>();

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

  const focusedCollaborators = useMemo(
    () =>
      permissionOrder.map((permission) => ({
        permission,
        label: permissionStyles[permission].label,
        collaborators: collaborators.filter(
          (collaborator) => collaborator.permissions[selectedArea] === permission,
        ),
      })),
    [collaborators, selectedArea],
  );

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
    setDialogError(undefined);
    setPageNotice(undefined);
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
    setDialogError(undefined);
    setPageNotice(undefined);
    setDialogOpen(true);
  }

  async function handleSaveCollaborator() {
    if (!form.name.trim() || !form.email.trim()) {
      setDialogError("Enter both collaborator name and email.");
      return;
    }

    setSaving(true);
    setDialogError(undefined);

    try {
      const result = await saveCollaboratorAction({
        collaboratorId: editingId,
        ...form,
      });

      if ("error" in result) {
        setDialogError(result.error);
        return;
      }

      if (dialogMode === "invite") {
        setCollaborators((current) => [...current, result.collaborator]);
      } else if (editingId) {
        setCollaborators((current) =>
          current.map((collaborator) =>
            collaborator.id === editingId ? result.collaborator : collaborator,
          ),
        );
      }

      setPageNotice(result.warning);
      setDialogOpen(false);
    } catch {
      setDialogError("Unable to save the collaborator right now. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="space-y-6">
        <MotionSection>
          <header className="flex flex-col gap-4">
            <h1 className="text-[42px] font-[600] leading-none tracking-[-0.05em] text-[#0f1411] sm:text-[56px]">
              Collaboration
            </h1>
          </header>
        </MotionSection>

        <MotionSection y={10}>
        <section className="rounded-[30px] bg-surface p-6 shadow-[0_22px_60px_rgba(23,39,28,0.06)]">
          <div className="space-y-8">
            <div className="space-y-3">
              <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#434747]">
                Quick Menu
              </h2>
              <p className="text-[14px] text-[#6f7771]">
                Select an access area to review who can view or manage it.
              </p>
            </div>

            {pageNotice ? (
              <div className="rounded-[18px] border border-[#f7dfb6] bg-[#fff8eb] px-4 py-3 text-[13px] text-[#946113]">
                {pageNotice}
              </div>
            ) : null}

            <MotionStaggerGroup
              className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
              stagger={0.045}
            >
              {accessCards.map((card) => {
                const Icon = card.icon;
                const active = selectedArea === card.area;
                const activeCount = collaborators.filter(
                  (collaborator) => collaborator.permissions[card.area] !== "none",
                ).length;

                return (
                  <MotionItem key={card.area} y={10}>
                    <Card
                      className={cn(
                        "rounded-[24px] border bg-white transition-all",
                        active
                          ? "border-brand/45 shadow-[0_18px_45px_rgba(23,39,28,0.07)]"
                          : "border-transparent",
                      )}
                    >
                      <CardContent className="p-5">
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div className="grid h-16 w-16 place-items-center rounded-[18px] bg-brand-soft text-brand">
                          <Icon className="h-8 w-8" />
                        </div>
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#edf4ee] text-brand">
                          <Users className="h-5 w-5" />
                        </div>
                      </div>

                      <h3 className="text-[16px] font-[700] text-[#141915]">{card.title}</h3>
                      <p className="mt-2 text-[13px] text-[#79817b]">
                        {activeCount} collaborators currently assigned
                      </p>

                      <Button
                        type="button"
                        onClick={() => setSelectedArea(card.area)}
                        variant={active ? "default" : "secondary"}
                        className="mt-5 w-full"
                      >
                        {active ? "Viewing" : "View"}
                      </Button>
                      </CardContent>
                    </Card>
                  </MotionItem>
                );
              })}
            </MotionStaggerGroup>

            <MotionSection y={10}>
            <Card className="rounded-[26px] border border-[#dfe7df] bg-[#fbfcfa] shadow-none">
              <CardHeader className="gap-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-[22px]">{areaLabels[selectedArea]}</CardTitle>
                      <Badge variant="secondary">
                        {collaborators.filter((item) => item.permissions[selectedArea] !== "none").length} with access
                      </Badge>
                    </div>
                    <CardDescription>
                      Review which collaborators currently have full, limited, or no access in this area.
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-[#2f8d5d]">{selectedAccessSummary.full} Full</Badge>
                    <Badge className="bg-[#f0a33a] text-white">{selectedAccessSummary.limited} Limited</Badge>
                    <Badge className="bg-[#ff5a58] text-white">{selectedAccessSummary.none} No access</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <MotionStaggerGroup className="grid gap-4 lg:grid-cols-3" stagger={0.04}>
                {focusedCollaborators.map((group) => (
                  <MotionItem key={group.permission} y={8}>
                    <Card
                      className="rounded-[22px] border border-[#e4ebe4] bg-white shadow-none"
                    >
                      <CardHeader className="pb-4">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-[18px]">{group.label}</CardTitle>
                        <Badge
                          variant="outline"
                          className={cn("border text-[11px]", permissionStyles[group.permission].badge)}
                        >
                          {group.collaborators.length}
                        </Badge>
                      </div>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                      {group.collaborators.length > 0 ? (
                        group.collaborators.map((collaborator) => (
                          <div key={`${group.permission}-${collaborator.id}`} className="flex items-center gap-3">
                            <div
                              className={cn(
                                "grid h-10 w-10 shrink-0 place-items-center rounded-full text-[12px] font-[700]",
                                group.permission === "full"
                                  ? "bg-[#dff3e7] text-brand"
                                  : group.permission === "limited"
                                    ? "bg-[#fff0da] text-[#d38713]"
                                    : "bg-[#ffe4e4] text-[#ef5855]",
                              )}
                            >
                              {getInitials(collaborator.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-[600] text-[#1f2923]">
                                {collaborator.name}
                              </p>
                              <p className="truncate text-[12px] text-[#7f877f]">
                                {collaborator.email}
                              </p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-[13px] text-[#7f877f]">
                          No collaborators currently fall into this access level.
                        </p>
                      )}
                      </CardContent>
                    </Card>
                  </MotionItem>
                ))}
                </MotionStaggerGroup>
              </CardContent>
            </Card>
            </MotionSection>

            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#434747]">
                  Collaborators
                </h2>
                <p className="mt-2 text-[14px] text-[#6f7771]">
                  Current focus: {areaLabels[selectedArea]}. Full: {selectedAccessSummary.full},
                  {" "}Limited: {selectedAccessSummary.limited}, No access: {selectedAccessSummary.none}.
                </p>
              </div>

              <Button type="button" onClick={openInviteDialog} className="self-start xl:self-auto">
                Invite <Plus className="h-4 w-4" />
              </Button>
            </div>

            <MotionSection y={10}>
            <Card className="overflow-hidden rounded-[24px] border border-transparent bg-white">
              <CardContent className="p-0">
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
                        className={cn(
                          "grid justify-center text-center",
                          active ? "text-brand" : "text-[#8b948d]",
                        )}
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
                  {collaborators.length > 0 ? collaborators.map((collaborator) => (
                    <MotionItem
                      key={collaborator.id}
                      layout
                      className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(220px,1.25fr)_repeat(4,minmax(68px,84px))_56px] lg:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            "grid h-10 w-10 shrink-0 place-items-center rounded-full text-[12px] font-[700]",
                            collaborator.permissions[selectedArea] === "full"
                              ? "bg-[#dff3e7] text-brand"
                              : collaborator.permissions[selectedArea] === "limited"
                                ? "bg-[#fff0da] text-[#d38713]"
                                : "bg-[#ffe4e4] text-[#ef5855]",
                          )}
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
                          <Separator className="mx-6 bg-[#d7ddd6]" />
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
                                className={cn(
                                  "grid h-8 w-8 place-items-center rounded-md",
                                  styles.box,
                                  active && "ring-2 ring-[#d5dfd8]",
                                )}
                                title={`${card.title}: ${styles.label}`}
                              >
                                <Icon className={cn("h-4 w-4", styles.icon)} />
                              </div>
                              <span className="text-[10px] text-[#7f877f] lg:hidden">
                                {card.title.split(" ")[0]}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          onClick={() => openEditDialog(collaborator)}
                          className="h-9 w-9 border border-[#d9dfda] shadow-none"
                          aria-label={`Edit ${collaborator.name}`}
                        >
                          <PenLine className="h-4 w-4" />
                        </Button>
                      </div>
                    </MotionItem>
                  )) : (
                    <div className="px-5 py-12 text-center text-[14px] text-[#6f7771]">
                      No collaborators have been invited yet.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            </MotionSection>
          </div>
        </section>
        </MotionSection>
      </section>

      <CollaboratorDialog
        isOpen={dialogOpen}
        mode={dialogMode}
        form={form}
        error={dialogError}
        saving={saving}
        onClose={() => {
          setDialogError(undefined);
          setDialogOpen(false);
        }}
        onSubmit={handleSaveCollaborator}
        onChange={setFormValue}
        onPermissionChange={setPermissionValue}
      />
    </>
  );
}
