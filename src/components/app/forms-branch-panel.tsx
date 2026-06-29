"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, FileText, Loader2, Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ClinicalFormEditor, type EncounterFormData } from "@/components/app/clinical-form-editor";
import { SendFaxModal } from "@/components/app/send-fax-modal";
import { FORM_REGISTRY } from "@/lib/forms/registry";
import { formatDate } from "@/lib/utils";

type Workspace =
  | { type: "library" }
  | { type: "editor"; form: EncounterFormData; loading?: boolean };

export function FormsBranchPanel({
  patientId,
  encounterId,
  forms,
  isReadOnly,
  onRefresh,
}: {
  patientId: string;
  encounterId: string;
  forms: EncounterFormData[];
  isReadOnly: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faxTarget, setFaxTarget] = useState<{
    documentId: string;
    documentName: string;
    fileName: string;
    faxNumber: string;
    recipientName?: string;
  } | null>(null);

  const closeWorkspace = () => setWorkspace(null);

  const openLibrary = () => {
    if (isReadOnly) return;
    setWorkspace({ type: "library" });
  };

  const openEditor = useCallback(
    async (form: EncounterFormData) => {
      setWorkspace({ type: "editor", form, loading: true });
      setError(null);
      try {
        const data = await api<{ form: EncounterFormData }>(
          `/api/patients/${patientId}/forms/${form.id}`
        );
        setWorkspace({ type: "editor", form: data.form });
      } catch {
        setWorkspace({ type: "editor", form });
        setError("Could not refresh form details. Showing cached copy.");
      }
    },
    [patientId]
  );

  const handlePickTemplate = async (templateId: string) => {
    setCreating(templateId);
    setError(null);
    try {
      const data = await api<{ form: EncounterFormData }>(
        `/api/patients/${patientId}/encounters/${encounterId}/forms`,
        {
          method: "POST",
          json: { templateId },
        }
      );
      await onRefresh();
      setWorkspace({ type: "editor", form: data.form });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create form");
    } finally {
      setCreating(null);
    }
  };

  const handleEditorCompleted = async () => {
    await onRefresh();
    closeWorkspace();
  };

  const handleEditorSaved = async () => {
    await onRefresh();
    if (workspace?.type === "editor") {
      try {
        const data = await api<{ form: EncounterFormData }>(
          `/api/patients/${patientId}/forms/${workspace.form.id}`
        );
        setWorkspace({ type: "editor", form: data.form });
      } catch {
        // Keep current editor state if refresh fails.
      }
    }
  };

  const modalTitle =
    workspace?.type === "library"
      ? "Clinic Form Library"
      : workspace?.type === "editor"
        ? workspace.form.templateLabel
        : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-cyan-200">Encounter Forms</h3>
          <p className="text-xs text-[#6b7c93]">
            Forms attached to this visit
          </p>
        </div>
        {!isReadOnly && (
          <Button className="!h-8 gap-1.5" onClick={openLibrary}>
            <Plus size={14} />
            Add Form
          </Button>
        )}
      </div>

      {error && (
        <p className="mb-2 text-xs text-amber-400">{error}</p>
      )}

      {forms.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#243044] p-6 text-center">
          <FileText className="text-[#4a5a70]" size={28} />
          <p className="text-sm text-[#8b9cb3]">No forms on this encounter yet</p>
          {!isReadOnly && (
            <Button className="mt-1 !h-8 gap-1.5" onClick={openLibrary}>
              <Plus size={14} />
              Add Form
            </Button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5 overflow-y-auto">
          {forms.map((form) => (
            <li key={form.id}>
              <button
                type="button"
                onClick={() => openEditor(form)}
                className="flex w-full items-center gap-3 rounded-lg border border-[#243044] bg-[#0f1520] px-3 py-2.5 text-left transition-colors hover:border-cyan-900/60 hover:bg-[#141c28]"
              >
                <FileText
                  size={16}
                  className={
                    form.status === "COMPLETED"
                      ? "shrink-0 text-emerald-400"
                      : "shrink-0 text-cyan-400"
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[#d4dce8]">
                    {form.templateLabel}
                  </p>
                  <p className="text-xs text-[#6b7c93]">
                    {form.status === "COMPLETED" && form.completedAt
                      ? `Attached ${formatDate(form.completedAt)}`
                      : "Draft"}
                  </p>
                </div>
                {form.status === "COMPLETED" ? (
                  <CheckCircle2
                    size={16}
                    className="shrink-0 text-emerald-400"
                  />
                ) : (
                  <span className="shrink-0 rounded bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                    Draft
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={workspace !== null}
        onClose={closeWorkspace}
        title={modalTitle}
        xl={workspace?.type === "editor"}
        className={workspace?.type === "editor" ? "max-h-[90vh] overflow-hidden flex flex-col" : undefined}
      >
        {workspace?.type === "library" && (
          <div className="space-y-3">
            <p className="text-sm text-[#8b9cb3]">
              Choose a template to start a new form for this encounter.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {FORM_REGISTRY.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    disabled={creating !== null}
                    onClick={() => handlePickTemplate(template.id)}
                    className="flex h-full w-full flex-col gap-1 rounded-lg border border-[#243044] bg-[#0f1520] p-4 text-left transition-colors hover:border-violet-700/50 hover:bg-[#141c28] disabled:opacity-50"
                  >
                    <span className="text-sm font-medium text-violet-200">
                      {template.label}
                    </span>
                    <span className="text-xs text-[#6b7c93]">
                      {template.description}
                    </span>
                    {creating === template.id && (
                      <span className="mt-1 flex items-center gap-1 text-xs text-violet-300">
                        <Loader2 className="animate-spin" size={12} />
                        Creating...
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {workspace?.type === "editor" && workspace.loading && (
          <div className="flex min-h-[40vh] items-center justify-center text-[#6b7c93]">
            <Loader2 className="animate-spin" size={24} />
          </div>
        )}

        {workspace?.type === "editor" && !workspace.loading && (
          <ClinicalFormEditor
            patientId={patientId}
            form={workspace.form}
            isReadOnly={isReadOnly || workspace.form.status === "COMPLETED"}
            onBack={closeWorkspace}
            onCompleted={handleEditorCompleted}
            onSaved={handleEditorSaved}
            inModal
            onFaxReferral={(documentId, faxNumber, recipientName) => {
              const doc = workspace.form.document;
              setFaxTarget({
                documentId,
                documentName: doc?.name ?? workspace.form.templateLabel,
                fileName: doc?.fileName ?? `${workspace.form.templateLabel}.pdf`,
                faxNumber,
                recipientName,
              });
            }}
          />
        )}
      </Modal>

      {faxTarget && (
        <SendFaxModal
          open
          onClose={() => setFaxTarget(null)}
          patientId={patientId}
          encounterId={encounterId}
          documents={[
            {
              id: faxTarget.documentId,
              name: faxTarget.documentName,
              fileName: faxTarget.fileName,
            },
          ]}
          initialDocumentId={faxTarget.documentId}
          initialToNumber={faxTarget.faxNumber}
          initialToName={faxTarget.recipientName}
          onSent={async () => {
            await onRefresh();
            setFaxTarget(null);
          }}
        />
      )}
    </div>
  );
}
