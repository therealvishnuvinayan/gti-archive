"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Link2, Paperclip } from "lucide-react";

import { ProjectCollaboratorsPanel } from "@/components/projects/project-collaborators-panel";
import type {
  ProjectCompareNote,
  ProjectCollaboratorRecord,
  ProjectFlowRecord,
  ProjectStageRecord,
} from "@/lib/projects";

type ProjectCompareWorkspaceProps = {
  project: ProjectFlowRecord;
  stageId?: string;
};

const attachmentStyles: Record<string, string> = {
  AI: "bg-[#2d1207] text-[#ff9d12]",
  PSD: "bg-[#042a4c] text-[#57b2ff]",
  PDF: "bg-[#ffffff] text-[#ff4338] border border-[#f0dada]",
  FIG: "bg-[#ffffff] text-[#6f7b74] border border-[#dbe3dc]",
  ZIP: "bg-[#ffffff] text-[#53a05b] border border-[#dbe3dc]",
};

function getAttachmentClass(type: string) {
  return attachmentStyles[type] ?? "bg-white text-brand border border-[#dbe3dc]";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ProjectCompareWorkspace({
  project,
  stageId,
}: ProjectCompareWorkspaceProps) {
  const [collaborators, setCollaborators] = useState<ProjectCollaboratorRecord[]>(
    project.collaborators,
  );
  const [opacity, setOpacity] = useState(50);
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState<ProjectCompareNote[]>(project.compareNotes ?? []);

  const activeStage = useMemo<ProjectStageRecord | undefined>(() => {
    if (!stageId) {
      return project.stageCards.find((stage) => stage.id === project.currentStageId) ?? project.stageCards[0];
    }

    return project.stageCards.find((stage) => stage.id === stageId) ?? project.stageCards[0];
  }, [project.currentStageId, project.stageCards, stageId]);

  function removeCollaborator(id: string) {
    setCollaborators((current) => current.filter((collaborator) => collaborator.id !== id));
  }

  function addComment() {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    setNotes((current) => [
      ...current,
      {
        id: `note-${Date.now()}`,
        author: "You",
        role: "Collaborator",
        date: "Now",
        body: trimmed,
        x: "69%",
        y: "72%",
      },
    ]);
    setDraft("");
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_288px]">
        <div className="rounded-[20px] bg-white p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
          <div className="rounded-[22px] bg-[linear-gradient(135deg,#2f8d5d,#3e9e69)] px-6 py-5 text-white shadow-[0_18px_45px_rgba(23,39,28,0.08)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-[18px] font-[700] tracking-[-0.02em]">
                  Comparison Window 2N
                </h1>
                <div className="mt-3 flex flex-wrap gap-6 text-[13px]">
                  <div>
                    <p className="font-[700] text-[#95d867]">Revision 3</p>
                    <p>{activeStage?.label ?? project.currentStageName}</p>
                  </div>
                  <div>
                    <p className="font-[700] text-[#95d867]">Revision 2</p>
                    <p>{activeStage?.label ?? project.currentStageName}</p>
                  </div>
                  <div>
                    <p className="text-[14px] font-[700]">{project.title}</p>
                    <p className="text-[14px] font-[700] text-[#95d867]">{project.category}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <div className="grid h-7 w-7 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-[10px] font-[700] text-white">
                    F
                  </div>
                  <div>
                    <p className="text-[12px] font-[600]">Ferrucio Lamborghini</p>
                    <p className="text-[10px] text-[#c2f4be]">Designer</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[16px] border border-white/25 bg-[#2c855c]/80 p-3 shadow-[0_10px_24px_rgba(13,39,27,0.28)]">
                <p className="text-center text-[11px] font-[700]">Attachments</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["AI", "PSD", "PDF", "FIG", "ZIP"].map((attachment) => (
                    <div
                      key={attachment}
                      className={`grid h-8 w-8 place-items-center rounded-md text-[10px] font-[700] ${getAttachmentClass(attachment)}`}
                    >
                      {attachment}
                    </div>
                  ))}
                </div>
                <Link
                  href={`/projects/${project.id}/chat?stage=${activeStage?.id ?? ""}`}
                  className="mt-3 inline-flex min-h-[30px] w-full items-center justify-center rounded-full bg-[#23593a] px-3 text-[11px] font-[600] text-white"
                >
                  Back to stage chat
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_184px]">
            <div className="rounded-[36px] border border-brand/45 bg-[#fbfcfa] p-5">
              <div className="relative min-h-[270px]">
                <div className="absolute left-[4%] top-[10%] h-[170px] w-[44%] rounded-[10px] bg-[linear-gradient(145deg,#ffb100,#ff9a00)] shadow-[0_14px_30px_rgba(48,28,0,0.18)]" />
                <div
                  className="absolute left-[12%] top-[18%] h-[150px] w-[48%] rounded-[10px] border border-white/50 bg-[linear-gradient(145deg,#f6a700,#ffca38)] shadow-[0_14px_30px_rgba(48,28,0,0.18)]"
                  style={{ opacity: opacity / 100 }}
                >
                  <div className="absolute bottom-0 left-0 right-0 h-[48px] rounded-b-[10px] bg-[linear-gradient(180deg,#263742,#0f1f28)]" />
                  <div className="absolute right-[10%] top-[18%] rounded bg-white px-2 py-1 text-[10px] font-[700] text-[#202822]">
                    exclusive MILAN
                  </div>
                  <div className="absolute left-[8%] top-[38%] h-[82px] w-[26%] rounded bg-[#fff4d4]" />
                </div>

                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="absolute"
                    style={{ left: note.x, top: note.y }}
                  >
                    <div className="relative h-5 w-5 rounded-full border-2 border-[#d4a35c] bg-[radial-gradient(circle_at_top,#fbe1c0,#aa6f34)] shadow-[0_4px_10px_rgba(0,0,0,0.18)]">
                      <span className="absolute -right-1 -top-1 grid h-2.5 w-2.5 place-items-center rounded-full bg-[#f44336] text-[7px] text-white">
                        •
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {notes.length > 0 ? (
                notes.slice(0, 2).map((note) => (
                  <article
                    key={note.id}
                    className="rounded-[10px] border border-[#dbe3dc] bg-white p-3 shadow-[0_8px_20px_rgba(19,28,22,0.04)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="grid h-6 w-6 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-[10px] font-[700] text-white">
                          {getInitials(note.author)}
                        </div>
                        <div>
                          <p className="text-[11px] font-[700] text-[#111712]">{note.author}</p>
                          <p className="text-[9px] text-[#7a837b]">{note.role}</p>
                        </div>
                      </div>
                      <span className="text-[8px] text-[#8b938d]">{note.date}</span>
                    </div>
                    <p className="mt-2 text-[11px] leading-[1.3] text-[#111712]">{note.body}</p>
                    {note.attachments?.length ? (
                      <div className="mt-2 flex justify-end gap-2">
                        {note.attachments.map((attachment) => (
                          <div
                            key={`${note.id}-${attachment}`}
                            className={`grid h-6 w-6 place-items-center rounded-md text-[8px] font-[700] ${getAttachmentClass(attachment)}`}
                          >
                            {attachment}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="rounded-[10px] border border-dashed border-[#dbe3dc] bg-white p-4 text-[12px] text-[#7a837b] shadow-[0_8px_20px_rgba(19,28,22,0.04)]">
                  No comparison notes have been added for this stage yet.
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-[24px] flex-1 items-center rounded-full bg-[#d4d6d5] p-1">
              <input
                type="range"
                min={0}
                max={100}
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
                className="w-full accent-brand"
                aria-label="Adjust comparison opacity"
              />
            </div>
            <span className="min-w-[120px] text-center text-[11px] text-[#ffffff]">
              <span className="inline-flex min-w-[180px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#3d9f69)] px-4 py-1.5 text-white">
                {opacity}% Opacity
              </span>
            </span>
          </div>

          <div className="mt-3">
            <h2 className="text-[18px] font-[700] text-brand">Comments</h2>
            <div className="mt-2 grid gap-3 xl:grid-cols-[minmax(0,1fr)_124px]">
              <div className="relative rounded-[18px] bg-[#f7f7f7] p-4">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Type your comments"
                  className="min-h-[80px] w-full resize-none bg-transparent text-[13px] text-[#1b231d] outline-none placeholder:text-[#b6bbb7]"
                />
                <div className="absolute bottom-3 right-3 flex items-center gap-2 text-[#b2bab3]">
                  <Paperclip className="h-4 w-4" />
                  <Link2 className="h-4 w-4" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={addComment}
                  className="inline-flex min-h-[36px] cursor-pointer items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-5 text-[14px] font-[600] text-white"
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={() => setDraft("")}
                  className="inline-flex min-h-[36px] cursor-pointer items-center justify-center rounded-full border border-brand bg-white px-5 text-[14px] font-[600] text-brand"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <aside className="rounded-[20px] border border-brand/40 bg-white p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
            <h2 className="text-[20px] font-[700] tracking-[-0.03em] text-brand">
              Stage Overview
            </h2>
            <dl className="mt-3 space-y-1.5 text-[13px] text-[#242b26]">
              <div>
                <dt className="inline font-[700]">Budget :</dt>{" "}
                <dd className="inline">{activeStage?.budget ?? project.budget}</dd>
              </div>
              <div>
                <dt className="inline font-[700]">Revisions :</dt>{" "}
                <dd className="inline">{notes.length}</dd>
              </div>
              <div>
                <dt className="inline font-[700]">Stage Started :</dt>{" "}
                <dd className="inline">{activeStage?.createdOn ?? project.startDate}</dd>
              </div>
              <div>
                <dt className="inline font-[700]">Stage Deadline :</dt>{" "}
                <dd className="inline">{project.endDate}</dd>
              </div>
            </dl>
            <div className="mt-5">
              <Link
                href="#"
                className="inline-flex min-h-[36px] min-w-[110px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-5 text-[13px] font-[600] text-white"
              >
                Brief
              </Link>
            </div>
          </aside>

          <ProjectCollaboratorsPanel
            collaborators={collaborators}
            onRemove={removeCollaborator}
          />
        </div>
      </div>
    </section>
  );
}
