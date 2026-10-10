"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, PenLine, Plus, Search, Trash2, UserRound } from "lucide-react";

import { deleteDirectoryContactAction, saveDirectoryContactAction } from "@/app/(dashboard)/clients/actions";
import { ProjectContactDialog, type ProjectContactForm } from "@/components/projects/project-contact-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import type { ContactDirectoryKind, ContactDirectoryRecord } from "@/lib/contact-directory";
import { validateProjectContactInput, type ProjectContactFieldErrors } from "@/lib/project-contact-validation";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

function getForm(kind: ContactDirectoryKind, contact?: ContactDirectoryRecord): ProjectContactForm {
  return {
    entityType: contact?.entityType ?? (kind === "CLIENT" ? "COMPANY" : "PERSON"),
    name: contact?.name ?? "",
    company: contact?.company ?? "",
    companyEmail: contact?.companyEmail ?? "",
    companyPhone: contact?.companyPhone ?? "",
    companyWebsite: contact?.companyWebsite ?? "",
    position: contact?.position ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
  };
}

function contactLabel(kind: ContactDirectoryKind, contact: ContactDirectoryRecord) {
  return kind === "CLIENT" || contact.entityType === "COMPANY"
    ? contact.company || contact.name
    : contact.name;
}

function ContactDetails({ contact }: { contact: ContactDirectoryRecord }) {
  const fields = contact.entityType === "COMPANY"
    ? [["Company Name", contact.company], ["Company Email", contact.companyEmail], ["Company Contact Number", contact.companyPhone], ["Company Website", contact.companyWebsite], ["Contact Person / Representative", contact.name], ["Representative Email", contact.email], ["Representative Contact Number", contact.phone], ["Representative Designation", contact.position]]
    : [["Company Name", contact.company], ["Full Name", contact.name], ["Email", contact.email], ["Contact Number", contact.phone], ["Designation", contact.position]];
  return (
    <dl className="mt-4 grid gap-x-6 gap-y-4 border-t border-[#e3e9e3] pt-4 sm:grid-cols-2 lg:grid-cols-4">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] font-[650] text-[#7b857e]">{label}</dt>
          <dd className="mt-1 whitespace-normal break-words text-[13px] text-[#273129]">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ContactDirectoryWorkspace({ kind, initialContacts }: {
  kind: ContactDirectoryKind;
  initialContacts: ContactDirectoryRecord[];
}) {
  const title = kind === "CLIENT" ? "Clients" : "Final Beneficiaries";
  const singular = kind === "CLIENT" ? "Client" : "Final Beneficiary";
  const router = useRouter();
  const contacts = initialContacts;
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "COMPANY" | "PERSON">("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState(() => getForm(kind));
  const [fieldErrors, setFieldErrors] = useState<ProjectContactFieldErrors>({});
  const [dialogError, setDialogError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ContactDirectoryRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();

  const filteredContacts = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("en");
    return contacts.filter(contact =>
      (typeFilter === "ALL" || contact.entityType === typeFilter) &&
      (!search || [contact.name, contact.company, contact.email, contact.companyEmail, contact.phone, contact.companyPhone, contact.companyWebsite, contact.position].some(value => value?.toLocaleLowerCase("en").includes(search))),
    ).sort((a, b) => contactLabel(kind, a).localeCompare(contactLabel(kind, b)));
  }, [contacts, kind, query, typeFilter]);

  function openDialog(contact?: ContactDirectoryRecord) {
    setEditingId(contact?.id);
    setForm(getForm(kind, contact));
    setFieldErrors({});
    setDialogError(undefined);
    setDialogOpen(true);
  }

  async function saveContact() {
    const validation = validateProjectContactInput({ ...form, kind });
    if (Object.keys(validation.fieldErrors).length) {
      setFieldErrors(validation.fieldErrors);
      setDialogError("Review the highlighted details.");
      return;
    }
    setSaving(true);
    setDialogError(undefined);
    setFieldErrors({});
    try {
      const result = await saveDirectoryContactAction(kind, validation.data, editingId);
      if ("error" in result) {
        setDialogError(result.error);
        setFieldErrors("fieldErrors" in result ? result.fieldErrors ?? {} : {});
        return;
      }
      setDialogOpen(false);
      router.refresh();
      showSuccessToast(`${singular} ${editingId ? "updated" : "added"}.`);
    } catch {
      setDialogError("Unable to save this entry right now. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteContact() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(undefined);
    try {
      const result = await deleteDirectoryContactAction(kind, pendingDelete.id);
      if ("error" in result) {
        setDeleteError(result.error);
        return;
      }
      setPendingDelete(null);
      router.refresh();
      showSuccessToast(`${singular} deleted.`);
    } catch {
      setDeleteError("Unable to delete this entry right now. Please try again.");
      showErrorToast("Unable to delete this entry.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[36px] font-[740] tracking-[-0.04em] text-[#111712] sm:text-[42px]">{title}</h1>
          <p className="mt-2 text-[14px] text-[#6a746d]">Manage {title.toLowerCase()} for quick selection in Stage 1.</p>
        </div>
        <Button onClick={() => openDialog()} className="gap-2 rounded-[14px]"><Plus className="h-4 w-4" />Add {singular}</Button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-[#859087]" />
          <Input aria-label={`Search ${title.toLowerCase()}`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, company, email or phone..." className="h-11 rounded-[13px] bg-white pl-10" />
        </div>
        <select aria-label="Filter by type" value={typeFilter} onChange={event => setTypeFilter(event.target.value as typeof typeFilter)} className="h-11 rounded-[13px] border border-[#dce3dc] bg-white px-4 text-[13px]">
          <option value="ALL">All types</option><option value="COMPANY">Company</option><option value="PERSON">Person</option>
        </select>
      </div>

      <p className="text-[12px] text-[#7b857e]">{filteredContacts.length} of {contacts.length} {title.toLowerCase()}</p>
      {filteredContacts.length ? (
        <div className="space-y-3">
          {filteredContacts.map(contact => {
            const label = contactLabel(kind, contact);
            const Icon = contact.entityType === "COMPANY" ? Building2 : UserRound;
            return (
              <Card key={contact.id} className="rounded-[18px] border-[#dfe7df] shadow-none">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#edf4ee] text-[#2d704b]"><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <h2 className="whitespace-normal break-words text-[16px] font-[720] text-[#202923]">{label}</h2>
                      <p className="mt-0.5 whitespace-normal break-words text-[12px] text-[#7b857e]">{[contact.entityType === "COMPANY" ? "Company" : "Person", contact.name !== label ? contact.name : null, contact.companyEmail || contact.email].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" className="gap-1.5 rounded-[10px]" aria-label={`Edit ${label}`} onClick={() => openDialog(contact)}><PenLine className="h-3.5 w-3.5" />Edit</Button>
                      <Button variant="secondary" size="sm" className="gap-1.5 rounded-[10px] text-[#b84e48]" aria-label={`Delete ${label}`} onClick={() => { setPendingDelete(contact); setDeleteError(undefined); }}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
                    </div>
                  </div>
                  <details className="group mt-3">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-[12px] font-[650] text-[#2d704b]">View details<ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" /></summary>
                    <ContactDetails contact={contact} />
                  </details>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="rounded-[18px] border-dashed border-[#dce3dc] shadow-none">
          <CardContent className="py-12 text-center">
            <p className="text-[15px] font-[650] text-[#273129]">{contacts.length ? "No matching entries." : `No ${title.toLowerCase()} yet.`}</p>
            <p className="mt-2 text-[13px] text-[#7b857e]">{contacts.length ? "Try a different search or type filter." : `Add a ${singular.toLowerCase()} to get started.`}</p>
          </CardContent>
        </Card>
      )}

      <ProjectContactDialog kind={kind} isOpen={dialogOpen} title={`${editingId ? "Edit" : "Add"} ${singular}`} description={`Enter the ${singular.toLowerCase()} details for use in Stage 1.`} submitLabel={editingId ? "Save Changes" : `Add ${singular}`} pendingLabel={editingId ? "Saving..." : "Adding..."} form={form} fieldErrors={fieldErrors} error={dialogError} saving={saving} onClose={() => { if (!saving) setDialogOpen(false); }} onSubmit={() => void saveContact()} onChange={(field, value) => { setForm(current => ({ ...current, [field]: value })); setFieldErrors(current => ({ ...current, [field]: undefined })); setDialogError(undefined); }} />
      <ConfirmationDialog isOpen={Boolean(pendingDelete)} title={`Delete ${singular}?`} description={`Delete ${pendingDelete ? contactLabel(kind, pendingDelete) : "this entry"} from future selections? Details already saved in projects will be kept.`} confirmLabel="Delete" pendingLabel="Deleting..." tone="destructive" pending={deleting} error={deleteError} onConfirm={() => void deleteContact()} onClose={() => { if (!deleting) setPendingDelete(null); }} />
    </section>
  );
}
