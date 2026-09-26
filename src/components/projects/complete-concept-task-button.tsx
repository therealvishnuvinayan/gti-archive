"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { completeStageThreeTaskWithoutFileAction } from "@/app/(dashboard)/projects/[slug]/stages/concept-actions";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { showSuccessToast } from "@/lib/toast";

export function CompleteConceptTaskButton({ projectId, folderId, name, onCompleted }: {
  projectId: string; folderId: string; name: string; onCompleted?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  function complete() {
    setError(undefined);
    startTransition(async () => {
      try {
        const result = await completeStageThreeTaskWithoutFileAction({ projectId, folderId });
        if ("error" in result) { setError(result.error); return; }
        setOpen(false);
        onCompleted?.();
        showSuccessToast("Task completed without a file submission.");
        router.refresh();
      } catch { setError("Unable to complete this task. Please try again."); }
    });
  }
  return <>
    <Button type="button" variant="outline" size="sm" className="relative z-10 h-auto min-h-9 whitespace-normal text-[11px]" disabled={pending} onClick={() => { setError(undefined); setOpen(true); }}>
      <CheckCircle2 className="size-4 shrink-0" />Complete without file
    </Button>
    <ConfirmationDialog isOpen={open} title="Complete task without a file?" description={`Mark “${name}” as completed? This closes the task and records that no file submission was required.`} confirmLabel="Complete Task" pending={pending} error={error} onConfirm={complete} onClose={() => { if (!pending) setOpen(false); }} />
  </>;
}
