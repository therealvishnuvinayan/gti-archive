"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Languages,
  Link2,
  Paperclip,
  Plus,
} from "lucide-react";

import { ProjectCollaboratorsPanel } from "@/components/projects/project-collaborators-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  ProjectChatEntry,
  ProjectCollaboratorRecord,
  ProjectFlowRecord,
  ProjectStageRecord,
} from "@/lib/projects";

type ProjectChatWorkspaceProps = {
  project: ProjectFlowRecord;
  stageId?: string;
};

type ChatMessage = ProjectChatEntry;

const attachmentStyles: Record<string, string> = {
  AI: "bg-[#2d1207] text-[#ff9d12]",
  PSD: "bg-[#042a4c] text-[#57b2ff]",
  PDF: "bg-[#ffffff] text-[#ff4338] border border-[#f0dada]",
  FIG: "bg-[#ffffff] text-[#6f7b74] border border-[#dbe3dc]",
  ZIP: "bg-[#ffffff] text-[#53a05b] border border-[#dbe3dc]",
  LINK: "bg-[#ffffff] text-[#9fb6a6] border border-[#dbe3dc]",
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

export function ProjectChatWorkspace({
  project,
  stageId,
}: ProjectChatWorkspaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(project.chatEntries ?? []);
  const [collaborators, setCollaborators] = useState<ProjectCollaboratorRecord[]>(
    project.collaborators,
  );
  const [draft, setDraft] = useState("");

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

    setMessages((current) => [
      ...current,
      {
        id: `comment-${Date.now()}`,
        kind: "comment",
        author: "You",
        role: "Collaborator",
        body: trimmed,
      },
    ]);
    setDraft("");
  }

  function appendSystemComment(body: string) {
    setMessages((current) => [
      ...current,
      {
        id: `system-${Date.now()}-${body}`,
        kind: "comment",
        author: "System",
        role: "Update",
        body,
      },
    ]);
  }

  return (
    <section className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_288px]">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <Card className="border border-dashed border-[#d8e1d8] px-6 py-10 text-center">
              <CardTitle className="text-[20px]">
                {activeStage?.label ?? "Stage"} Chat
              </CardTitle>
              <p className="mt-2 text-[14px] text-[#6e776f]">
                No revisions or comments have been added to this stage yet.
              </p>
              <p className="mt-1 text-[13px] text-[#8a938c]">
                Use the input below to start the first discussion thread.
              </p>
            </Card>
          ) : null}

          {messages.map((message, index) =>
            message.kind === "revision" ? (
              <div
                key={message.id}
                className="flex flex-col gap-3 xl:flex-row xl:items-start"
              >
                <Card className="flex-1 rounded-[20px] border-none bg-[linear-gradient(135deg,#2f8d5d,#476f5a)] p-5 text-white shadow-[0_18px_45px_rgba(23,39,28,0.08)]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h1 className="text-[18px] font-[700] text-[#95d867]">
                        {message.title}
                      </h1>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="grid h-7 w-7 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-[10px] font-[700] text-white">
                          {getInitials(message.author)}
                        </div>
                        <div>
                          <p className="text-[12px] font-[600]">{message.author}</p>
                          <p className="text-[10px] text-[#93d68a]">{message.role}</p>
                        </div>
                      </div>
                      <p className="mt-3 max-w-[420px] text-[12px] leading-[1.45] text-white/90">
                        {message.body}{" "}
                        {message.briefLabel ? (
                          <span className="text-[#ffcc49] underline">{message.briefLabel}</span>
                        ) : null}
                      </p>
                    </div>

                    {message.attachments?.length ? (
                      <Card className="rounded-[16px] border border-white/25 bg-[#1f5f40]/75 p-3 shadow-[0_10px_24px_rgba(13,39,27,0.28)]">
                        <p className="text-center text-[11px] font-[700]">Attachments</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {message.attachments.map((attachment) => (
                            <div
                              key={`${message.id}-${attachment}`}
                              className={`grid h-8 w-8 place-items-center rounded-md text-[10px] font-[700] ${getAttachmentClass(attachment)}`}
                            >
                              {attachment}
                            </div>
                          ))}
                        </div>
                        {message.compareLabel ? (
                          <Button asChild size="sm" className="mt-3 min-h-[30px] w-full text-[11px]">
                            <Link href={`/projects/${project.id}/compare?stage=${activeStage?.id ?? ""}`}>
                              {message.compareLabel}
                            </Link>
                          </Button>
                        ) : null}
                      </Card>
                    ) : null}
                  </div>
                </Card>

                <div className="flex shrink-0 flex-col gap-2 xl:w-[160px]">
                  {index === 0 ? (
                    <>
                      <Button
                        type="button"
                        onClick={() => appendSystemComment("Stage marked as complete.")}
                        size="sm"
                        className="text-[12px]"
                      >
                        Mark as complete
                      </Button>
                      <Button
                        type="button"
                        onClick={() => appendSystemComment("Revision request created.")}
                        size="sm"
                        variant="secondary"
                        className="text-[12px]"
                      >
                        Create Revision
                      </Button>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    onClick={() => setDraft(`Replying to ${message.author}: `)}
                    size="sm"
                    variant="secondary"
                    className="text-[12px]"
                  >
                    Add Comments
                  </Button>
                </div>
              </div>
            ) : (
              <Card
                key={message.id}
                className="rounded-[8px] border border-[#4b4d4b] bg-white p-3 shadow-[0_8px_20px_rgba(19,28,22,0.04)]"
              >
                <div className="flex items-center gap-2">
                  <div className="grid h-6 w-6 place-items-center rounded-full bg-[linear-gradient(145deg,#f0dcc4,#b58257)] text-[10px] font-[700] text-white">
                    {getInitials(message.author)}
                  </div>
                  <div>
                    <p className="text-[12px] font-[700] text-[#111712]">{message.author}</p>
                    <p className="text-[10px] text-[#8acb74]">{message.role}</p>
                  </div>
                </div>
                <p className="mt-3 text-[12px] leading-[1.35] text-[#111712]">{message.body}</p>
                {message.attachments?.length ? (
                  <Card className="mt-3 inline-flex min-w-[120px] flex-col items-center rounded-[12px] border border-[#dde3de] px-4 py-2.5 text-center shadow-none">
                    <span className="text-[10px] font-[700] text-[#111712]">Attachments</span>
                    <div className="mt-2 flex gap-2">
                      {message.attachments.map((attachment) => (
                        <div
                          key={`${message.id}-${attachment}`}
                          className={`grid h-7 w-7 place-items-center rounded-md text-[9px] font-[700] ${getAttachmentClass(attachment)}`}
                        >
                          {attachment}
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : null}
              </Card>
            ),
          )}

          <Card className="sticky bottom-0 rounded-[22px] bg-white/95 p-3 backdrop-blur">
            <div className="flex items-center gap-3 rounded-full border border-[#e2e7e2] px-4 py-3">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder='Listening in Russian..... “This design needs to be changed”'
                className="h-auto border-none bg-transparent p-0 text-[14px] shadow-none ring-0 focus-visible:ring-0"
              />
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="icon" className="size-8 text-[#5083ff]" aria-label="Translate">
                  <Languages className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-md px-2 text-[10px] font-[700]"
                >
                  EN
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-8 text-brand" aria-label="Attach file">
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-8 text-brand" aria-label="Insert link">
                  <Link2 className="h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  onClick={addComment}
                  size="sm"
                  className="text-[12px]"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Send
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="rounded-[20px] border border-brand/40">
            <CardHeader className="pb-3">
            <CardTitle className="text-[20px] text-brand">
              Stage Overview
            </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
            <dl className="space-y-1.5 text-[13px] text-[#242b26]">
              <div>
                <dt className="inline font-[700]">Budget :</dt>{" "}
                <dd className="inline">{activeStage?.budget ?? project.budget}</dd>
              </div>
              <div>
                <dt className="inline font-[700]">Revisions :</dt>{" "}
                <dd className="inline">{messages.filter((message) => message.kind === "revision").length}</dd>
              </div>
              <div>
                <dt className="inline font-[700]">Stage Started :</dt>{" "}
                <dd className="inline">
                  {activeStage?.createdOn ?? project.startDate}
                </dd>
              </div>
              <div>
                <dt className="inline font-[700]">Stage Deadline :</dt>{" "}
                <dd className="inline">{project.endDate}</dd>
              </div>
            </dl>
            <div className="mt-5">
              <Button asChild size="sm" className="min-w-[110px] text-[13px]">
                <Link href="#">Brief</Link>
              </Button>
            </div>
            </CardContent>
          </Card>

          <ProjectCollaboratorsPanel
            collaborators={collaborators}
            onRemove={removeCollaborator}
          />
        </div>
      </div>
    </section>
  );
}
