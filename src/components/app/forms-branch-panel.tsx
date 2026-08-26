"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, FileText, Loader2, Plus, Trash2, Bookmark } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ClinicalFormEditor, type EncounterFormData } from "@/components/app/clinical-form-editor";
import { FillablePdfChartEditor } from "@/components/app/fillable-pdf-chart-editor";
import { FullPageDocumentViewer } from "@/components/app/full-page-document-viewer";
import { SendFaxModal } from "@/components/app/send-fax-modal";
import { listFormRegistry } from "@/lib/forms/registry";
import { getClinicalFormTemplate } from "@/lib/clinical-forms";
import { formatDate } from "@/lib/utils";

type Workspace =
  | { type: "library" }
  | { type: "editor"; form: EncounterFormData; loading?: boolean }
  | { type: "fillable-pdf"; templateId: string; label: string; pdfUrl: string }
  | { type: "viewer"; title: string; url: string; mimeType?: string };

export function FormsBranchPanel({
  patientId,
  encounterId,
  encounterDate,
  forms,
  isReadOnly,
  officeCode,
  patientName,
  onRefresh,
}: {
  patientId: string;
  encounterId: string;
  /** Encounter clinic day (YYYY-MM-DD) — prefilled as editable form date. */
  encounterDate?: string | null;
  forms: EncounterFormData[];
  isReadOnly: boolean;
  /** Active clinic code — used to filter office-specific templates (e.g. NCCC 6MWT). */
  officeCode?: string | null;
  /** Chart patient — used to auto-fill name/MRN/DOB fields on fillable PDFs. */
  patientName?: {
    displayName: string;
    firstName?: string | null;
    lastName?: string | null;
    mrn?: string | null;
    dateOfBirth?: string | Date | null;
  } | null;
  onRefresh: () => Promise<void>;
}) {
  const availableTemplates = listFormRegistry(officeCode);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [faxTarget, setFaxTarget] = useState<{
    documentId: string;
    documentName: string;
    fileName: string;
    faxNumber: string;
    recipientName?: string;
  } | null>(null);
  const [prefillPickerOpen, setPrefillPickerOpen] = useState(false);

  const closeWorkspace = () => {
    setPrefillPickerOpen(false);
    setWorkspace(null);
  };

  const openLibrary = () => {
    if (isReadOnly) return;
    setWorkspace({ type: "library" });
  };

  const openEditor = useCallback(
    async (form: EncounterFormData) => {
      setError(null);
      // Uploaded fillable PDFs: open the saved file, not the empty online editor.
      if (form.documentId || form.source === "UPLOAD") {
        const docId = form.documentId ?? form.document?.id;
        setWorkspace({
          type: "viewer",
          title: form.templateLabel,
          url: docId
            ? `/api/patients/${patientId}/documents/${docId}`
            : `/api/patients/${patientId}/forms/${form.id}/pdf`,
          mimeType: form.document?.mimeType ?? "application/pdf",
        });
        return;
      }

      setWorkspace({ type: "editor", form, loading: true });
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
    const template = getClinicalFormTemplate(templateId);
    if (template?.fillablePdfUrl) {
      setWorkspace({
        type: "fillable-pdf",
        templateId,
        label: template.label,
        pdfUrl: template.fillablePdfUrl,
      });
      return;
    }

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

  const handleDeleteDraft = async (form: EncounterFormData) => {
    if (form.status !== "DRAFT") return;
    if (!window.confirm(`Delete draft “${form.templateLabel}”? This cannot be undone.`)) {
      return;
    }
    setDeletingId(form.id);
    setError(null);
    try {
      await api(`/api/patients/${patientId}/forms/${form.id}`, { method: "DELETE" });
      if (workspace?.type === "editor" && workspace.form.id === form.id) {
        closeWorkspace();
      }
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete draft form");
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditorCompleted = async () => {
    await onRefresh();
    closeWorkspace();
  };

  const handleEditorSaved = async () => {
    // Refresh the encounter forms list for draft status, but do not replace
    // the open editor's form payload — that overwrote keystrokes mid-type.
    await onRefresh();
  };

  const showPrefillAccessory =
    workspace?.type === "editor" &&
    !workspace.loading &&
    workspace.form.templateId === "REFERRAL_MODERN_MEDICINE" &&
    !isReadOnly &&
    workspace.form.status !== "COMPLETED";

  const modalTitle =
    workspace?.type === "library"
      ? "Clinic Form Library"
      : workspace?.type === "editor"
        ? workspace.form.templateLabel
        : workspace?.type === "fillable-pdf"
          ? workspace.label
          : workspace?.type === "viewer"
            ? workspace.title
            : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-cyan-200">Encounter Forms</h3>
          <p className="text-xs text-[var(--pv-muted)]">
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
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--pv-border)] p-6 text-center">
          <FileText className="text-[#4a5a70]" size={28} />
          <p className="text-sm text-[var(--pv-muted-2)]">No forms on this encounter yet</p>
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
              <div className="flex w-full items-center gap-2 rounded-lg border border-[var(--pv-border)] bg-[var(--pv-panel)] px-3 py-2.5 transition-colors hover:border-[var(--pv-accent)]/50 hover:bg-[var(--pv-hover)]">
                <button
                  type="button"
                  onClick={() => openEditor(form)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
                    <p className="truncate text-sm font-medium text-[var(--pv-fg)]">
                      {form.templateLabel}
                    </p>
                    <p className="text-xs text-[var(--pv-muted)]">
                      {form.status === "COMPLETED" && form.completedAt
                        ? `Attached ${formatDate(form.completedAt)}`
                        : "Draft"}
                    </p>
                  </div>
                </button>
                {!isReadOnly && form.status === "DRAFT" && (
                  <button
                    type="button"
                    disabled={deletingId === form.id}
                    title="Delete draft"
                    aria-label="Delete draft"
                    onClick={() => void handleDeleteDraft(form)}
                    className="shrink-0 rounded p-1 text-[var(--pv-muted)] transition-colors hover:bg-rose-950/50 hover:text-rose-300 disabled:opacity-50"
                  >
                    {deletingId === form.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                )}
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
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={workspace !== null}
        onClose={closeWorkspace}
        title={modalTitle}
        titleAccessory={
          showPrefillAccessory ? (
            <Button
              className="!h-8 !shrink-0 !px-2.5 !text-xs"
              onClick={() => setPrefillPickerOpen(true)}
            >
              <Bookmark size={13} />
              Prefilled
            </Button>
          ) : undefined
        }
        xl={
          workspace?.type === "editor" ||
          workspace?.type === "fillable-pdf" ||
          workspace?.type === "viewer"
        }
        className={
          workspace?.type === "editor" ||
          workspace?.type === "fillable-pdf" ||
          workspace?.type === "viewer"
            ? "max-h-[90vh] overflow-hidden flex flex-col max-w-6xl"
            : undefined
        }
      >
        {workspace?.type === "library" && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--pv-muted-2)]">
              Choose a template to start a new form for this encounter.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {availableTemplates.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    disabled={creating !== null}
                    onClick={() => handlePickTemplate(template.id)}
                    className="flex h-full w-full flex-col gap-1 rounded-lg border border-[var(--pv-border)] bg-[var(--pv-panel)] p-4 text-left transition-colors hover:border-violet-700/50 hover:bg-[#141c28] disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-violet-200">
                      {template.label}
                      {template.fillablePdfUrl ? (
                        <span className="rounded bg-amber-900/35 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                          PDF
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-[var(--pv-muted)]">
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
            {availableTemplates.length === 0 && (
              <p className="text-sm text-[var(--pv-muted)]">
                No form templates are available for this clinic.
              </p>
            )}
          </div>
        )}

        {workspace?.type === "fillable-pdf" && (
          <FillablePdfChartEditor
            pdfUrl={workspace.pdfUrl}
            patientId={patientId}
            encounterId={encounterId}
            templateId={workspace.templateId}
            label={workspace.label}
            patientName={
              patientName
                ? {
                    ...patientName,
                    formDate:
                      encounterDate ??
                      (() => {
                        const d = new Date();
                        const mm = String(d.getMonth() + 1).padStart(2, "0");
                        const dd = String(d.getDate()).padStart(2, "0");
                        return `${d.getFullYear()}-${mm}-${dd}`;
                      })(),
                  }
                : encounterDate
                  ? { displayName: "", formDate: encounterDate }
                  : null
            }
            onCancel={closeWorkspace}
            onSaved={async () => {
              await onRefresh();
              closeWorkspace();
            }}
          />
        )}

        {workspace?.type === "viewer" && (
          <FullPageDocumentViewer
            title={workspace.title}
            url={workspace.url}
            mimeType={workspace.mimeType}
            onClose={closeWorkspace}
            backLabel="Back to Forms"
          />
        )}

        {workspace?.type === "editor" && workspace.loading && (
          <div className="flex min-h-[40vh] items-center justify-center text-[var(--pv-muted)]">
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
            prefillPickerOpen={prefillPickerOpen}
            onPrefillPickerOpenChange={setPrefillPickerOpen}
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
