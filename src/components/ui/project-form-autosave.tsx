"use client";

import {
  CloudCheck,
  CloudOff,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";
import { applyFieldPatches, type FieldPatch } from "@/lib/tasker/patches";

export type ProjectFormAutosaveStatus =
  | "idle"
  | "loading"
  | "dirty"
  | "saving"
  | "saved"
  | "conflict"
  | "error";

type ProjectFormDraftPayload = Record<string, unknown>;

type UseProjectFormAutosaveOptions<TValue extends ProjectFormDraftPayload> = {
  projectId: string;
  formKey: string;
  value: TValue;
  onRestore: (draft: TValue) => void;
  enabled?: boolean;
  debounceMs?: number;
};

type DraftResponse<TValue> = {
  tasker?: { revision: number; patches: FieldPatch[] };
  draft: {
    payload: TValue;
    revision: number;
    taskerRevision?: number;
    isTaskerOverlay?: boolean;
    updatedAt: string;
  } | null;
};

function serializeDraft(value: ProjectFormDraftPayload) {
  return JSON.stringify(value);
}

function createAutosaveClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useProjectFormAutosave<TValue extends ProjectFormDraftPayload>({
  projectId,
  formKey,
  value,
  onRestore,
  enabled = true,
  debounceMs = 900,
}: UseProjectFormAutosaveOptions<TValue>) {
  const apiUrl = useMemo(
    () =>
      `/api/projects/${encodeURIComponent(projectId)}/form-drafts/${encodeURIComponent(formKey)}`,
    [formKey, projectId],
  );
  const serialized = useMemo(() => serializeDraft(value), [value]);
  const [status, setStatus] = useState<ProjectFormAutosaveStatus>(
    enabled ? "loading" : "idle",
  );
  const [hydrated, setHydrated] = useState(!enabled);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [restoredAt, setRestoredAt] = useState<Date | null>(null);
  const [persistedSerialized, setPersistedSerialized] = useState<string | null>(null);
  const [clientId] = useState(createAutosaveClientId);
  const valueRef = useRef(value);
  const serializedRef = useRef(serialized);
  const onRestoreRef = useRef(onRestore);
  const persistedSerializedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const saveAgainRef = useRef(false);
  const suspendedRef = useRef(false);
  const mountedRef = useRef(true);
  const revisionRef = useRef(0);
  const taskerRevisionRef = useRef(0);
  const pendingTaskerRef = useRef<{ revision: number; patches: FieldPatch[] } | null>(null);
  const [taskerRevision, setTaskerRevision] = useState(0);
  const saveLatestRef = useRef<() => Promise<void>>(async () => undefined);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const saveLatest = useCallback(async () => {
    if (!enabled || !hydrated || suspendedRef.current || pendingTaskerRef.current) return;

    clearTimer();
    if (inFlightRef.current) {
      saveAgainRef.current = true;
      await inFlightRef.current;
      return;
    }

    const snapshot = valueRef.current;
    const snapshotSerialized = serializedRef.current;
    if (snapshotSerialized === persistedSerializedRef.current) {
      if (mountedRef.current) setStatus("saved");
      return;
    }

    revisionRef.current += 1;
    const clientRevision = revisionRef.current;
    if (mountedRef.current) {
      setStatus("saving");
      setRestoredAt(null);
    }

    let failed = false;
    const request = (async () => {
      try {
        const response = await fetch(apiUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payload: snapshot,
            clientId,
            clientRevision,
            taskerRevision: taskerRevisionRef.current,
          }),
        });
        if (!response.ok) {
          if (response.status === 409) {
            const latest = await fetch(`${apiUrl}?taskerRevision=${taskerRevisionRef.current}`, { cache: "no-store" }).then((r) => r.json()) as DraftResponse<TValue>;
            if (latest.tasker) { pendingTaskerRef.current = latest.tasker; setStatus("conflict"); failed = true; return; }
          }
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Unable to autosave this form.");
        }

        persistedSerializedRef.current = snapshotSerialized;
        if (mountedRef.current) setPersistedSerialized(snapshotSerialized);
        if (mountedRef.current) {
          setSavedAt(new Date());
          setStatus(
            serializedRef.current === snapshotSerialized ? "saved" : "dirty",
          );
        }
      } catch {
        failed = true;
        if (mountedRef.current) setStatus("error");
      }
    })();

    inFlightRef.current = request;
    await request;
    inFlightRef.current = null;

    if (
      !failed && !pendingTaskerRef.current && (saveAgainRef.current ||
      serializedRef.current !== persistedSerializedRef.current)
    ) {
      saveAgainRef.current = false;
      await saveLatestRef.current();
    }
  }, [apiUrl, clearTimer, clientId, enabled, hydrated]);

  useLayoutEffect(() => {
    valueRef.current = value;
    serializedRef.current = serialized;
    onRestoreRef.current = onRestore;
  }, [onRestore, serialized, value]);

  useLayoutEffect(() => {
    saveLatestRef.current = saveLatest;
  }, [saveLatest]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    suspendedRef.current = false;
    persistedSerializedRef.current = null;
    revisionRef.current = 0;
    taskerRevisionRef.current = 0;
    pendingTaskerRef.current = null;
    queueMicrotask(() => {
      if (cancelled) return;
      setTaskerRevision(0);
      setPersistedSerialized(null);
      setSavedAt(null);
      setRestoredAt(null);
    });

    if (!enabled) {
      queueMicrotask(() => {
        if (cancelled) return;
        setHydrated(true);
        setStatus("idle");
      });
      return;
    }

    const valueBeforeLoad = serializedRef.current;
    queueMicrotask(() => {
      if (cancelled) return;
      setHydrated(false);
      setStatus("loading");
    });

    void fetch(apiUrl, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load the saved draft.");
        return (await response.json()) as DraftResponse<TValue>;
      })
      .then(({ draft, tasker }) => {
        if (cancelled) return;
        const nextTaskerRevision = tasker?.revision ?? draft?.taskerRevision ?? 0;
        if (serializedRef.current !== valueBeforeLoad && tasker?.patches.length) {
          pendingTaskerRef.current = tasker;
          setStatus("conflict"); setHydrated(true); return;
        }
        taskerRevisionRef.current = nextTaskerRevision;
        setTaskerRevision(nextTaskerRevision);

        if (draft) {
          // Shallow defaults keep older drafts compatible when a form gains a field.
          const restoredPayload = draft.isTaskerOverlay ? applyFieldPatches(JSON.parse(valueBeforeLoad) as TValue, tasker?.patches ?? []) : {
            ...(JSON.parse(valueBeforeLoad) as TValue),
            ...draft.payload,
          };
          const draftSerialized = serializeDraft(restoredPayload);
          persistedSerializedRef.current = draftSerialized;
          setPersistedSerialized(draftSerialized);
          revisionRef.current = draft.revision;

          // Do not replace text entered while the restore request was in flight.
          if (serializedRef.current === valueBeforeLoad) {
            onRestoreRef.current(restoredPayload);
            setRestoredAt(new Date(draft.updatedAt));
            setSavedAt(new Date(draft.updatedAt));
          }
        } else {
          persistedSerializedRef.current = valueBeforeLoad;
          setPersistedSerialized(valueBeforeLoad);
        }

        setHydrated(true);
        setStatus(
          draft && serializedRef.current === valueBeforeLoad ? "saved" : "idle",
        );
      })
      .catch(() => {
        if (cancelled) return;
        persistedSerializedRef.current = valueBeforeLoad;
        setPersistedSerialized(valueBeforeLoad);
        setHydrated(true);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [apiUrl, enabled]);

  useEffect(() => {
    if (!enabled || !hydrated || suspendedRef.current || pendingTaskerRef.current) return;
    if (serialized === persistedSerializedRef.current) {
      queueMicrotask(() => {
        if (mountedRef.current) {
          setStatus((current) => (current === "dirty" ? "saved" : current));
        }
      });
      return;
    }

    queueMicrotask(() => {
      if (!mountedRef.current) return;
      setRestoredAt(null);
      setStatus("dirty");
    });
    clearTimer();
    timerRef.current = setTimeout(() => {
      void saveLatestRef.current();
    }, debounceMs);

    return clearTimer;
  }, [clearTimer, debounceMs, enabled, hydrated, serialized]);

  useEffect(() => {
    if (!enabled) return;

    const persistBeforeLeaving = () => {
      if (
        suspendedRef.current ||
        pendingTaskerRef.current ||
        persistedSerializedRef.current === null ||
        serializedRef.current === persistedSerializedRef.current
      ) {
        return;
      }

      revisionRef.current += 1;
      void fetch(apiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: valueRef.current,
          clientId,
          clientRevision: revisionRef.current,
          taskerRevision: taskerRevisionRef.current,
        }),
        keepalive: true,
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") persistBeforeLeaving();
    };
    const handleOnline = () => {
      if (serializedRef.current !== persistedSerializedRef.current) {
        void saveLatestRef.current();
      }
    };

    window.addEventListener("pagehide", persistBeforeLeaving);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      persistBeforeLeaving();
      window.removeEventListener("pagehide", persistBeforeLeaving);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [apiUrl, clientId, enabled]);

  useEffect(() => {
    if (!enabled || !hydrated) return;
    let cancelled = false;
    const check = async () => {
      if (document.hidden || suspendedRef.current || pendingTaskerRef.current) return;
      try {
        const response = await fetch(`${apiUrl}?taskerRevision=${taskerRevisionRef.current}`, { cache: "no-store" });
        if (!response.ok) return;
        const { tasker } = await response.json() as DraftResponse<TValue>;
        if (cancelled || !tasker || tasker.revision <= taskerRevisionRef.current) return;
        pendingTaskerRef.current = tasker;
        clearTimer(); setStatus("conflict");
      } catch { /* Normal autosave continues to report connection errors. */ }
    };
    const timer = setInterval(() => void check(), 15000);
    window.addEventListener("focus", check);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("focus", check); };
  }, [apiUrl, clearTimer, enabled, hydrated]);

  const retry = useCallback(async () => {
    const pending = pendingTaskerRef.current;
    if (!pending) return saveLatest();
    if (!pending.patches.length) {
      if (window.confirm("This form was updated and saved elsewhere. Reload to review its current values? Unsaved browser edits will be lost.")) window.location.reload();
      return;
    }
    const fields = [...new Set(pending.patches.map((p) => p.path.join(" → ")))];
    if (!window.confirm(`Tasker has accepted new input for this form. Apply the accepted values to ${fields.join(", ") || "the changed fields"}? Your other edits will be kept. You can review the updated fields before submitting.`)) return;
    const merged = applyFieldPatches(valueRef.current, pending.patches);
    valueRef.current = merged; serializedRef.current = serializeDraft(merged);
    onRestoreRef.current(merged);
    taskerRevisionRef.current = pending.revision; setTaskerRevision(pending.revision);
    pendingTaskerRef.current = null; setStatus("dirty");
    await saveLatest();
  }, [saveLatest]);

  const clearDraft = useCallback(async (options?: {
    resume?: boolean;
    baseline?: TValue;
  }) => {
    suspendedRef.current = true;
    clearTimer();
    await inFlightRef.current;
    const response = await fetch(apiUrl, { method: "DELETE" });
    if (!response.ok) throw new Error("Unable to clear the completed form draft.");
    persistedSerializedRef.current = options?.baseline
      ? serializeDraft(options.baseline)
      : serializedRef.current;
    setPersistedSerialized(persistedSerializedRef.current);
    suspendedRef.current = options?.resume !== true;
    if (mountedRef.current) {
      setStatus("idle");
      setSavedAt(null);
      setRestoredAt(null);
    }
  }, [apiUrl, clearTimer]);

  return {
    status,
    taskerRevision,
    savedAt,
    restoredAt,
    hasUnsavedChanges:
      hydrated && serialized !== persistedSerialized,
    flush: saveLatest,
    retry,
    clearDraft,
  };
}

export function ProjectFormAutosaveStatus({
  status,
  savedAt,
  restoredAt,
  onRetry,
  className,
}: {
  status: ProjectFormAutosaveStatus;
  savedAt?: Date | null;
  restoredAt?: Date | null;
  onRetry?: () => void;
  className?: string;
}) {
  if (status === "conflict") return <button type="button" onClick={onRetry} className={cn("rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900", className)}>Tasker updated this form · Review accepted input</button>;
  if (status === "idle") {
    return (
      <span className={cn("text-[12px] font-[620] text-[#718078]", className)}>
        Autosave ready
      </span>
    );
  }

  if (status === "loading") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-[620] text-[#718078]", className)}>
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        Checking saved draft…
      </span>
    );
  }

  if (status === "dirty" || status === "saving") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-[650] text-[#567060]", className)}>
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        {status === "saving" ? "Saving draft…" : "Changes pending…"}
      </span>
    );
  }

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className={cn("inline-flex items-center gap-1.5 rounded-md text-[12px] font-[680] text-[#b24d47] hover:text-[#8d332e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b24d47]", className)}
      >
        <CloudOff className="h-3.5 w-3.5" />
        Draft not saved
        <RefreshCw className="h-3 w-3" />
      </button>
    );
  }

  const time = savedAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[12px] font-[650] text-[#39845d]", className)}
      title={savedAt ? `Saved ${savedAt.toLocaleString()}` : undefined}
    >
      <CloudCheck className="h-3.5 w-3.5" />
      {restoredAt ? "Draft restored" : time ? `Draft saved at ${time}` : "Draft saved"}
    </span>
  );
}
