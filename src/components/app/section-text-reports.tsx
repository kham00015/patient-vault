"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DOCUMENT_SECTION_LABELS,
  defaultTextReportTitle,
  isTextReportDocument,
  type TextReportSectionKey,
} from "@/lib/document-sections";
import { formatDate, cn } from "@/lib/utils";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";

type ReportDoc = {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  authorName?: string | null;
  openUrl?: string;
};

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; doc: ReportDoc; content: string }
  | null;

/** Standalone written reports for Echo / PFTs / Sleep / Imaging — each becomes a Documents entry. */
export function SectionTextReports({
  patientId,
  sectionKey,
  readOnly,
}: {
  patientId: string;
  sectionKey: TextReportSectionKey;
  readOnly: boolean;
}) {
  const [docs, setDocs] = useState<ReportDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const label = DOCUMENT_SECTION_LABELS[sectionKey];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ documents: ReportDoc[] }>(
        `/api/patients/${patientId}/documents?sectionKey=${encodeURIComponent(sectionKey)}`
      );
      setDocs((data.documents ?? []).filter((d) => isTextReportDocument(d)));
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [patientId, sectionKey]);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setError(null);
    setTitle(defaultTextReportTitle(sectionKey));
    setBody("");
    setEditor({ mode: "create" });
  }

  async function startEdit(doc: ReportDoc) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(doc.openUrl ?? `/api/patients/${patientId}/documents/${doc.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Could not load report");
      const content = await res.text();
      setTitle(doc.name);
      setBody(content);
      setEditor({ mode: "edit", doc, content });
    } catch {
      setError("Could not open report for editing.");
    } finally {
      setSaving(false);
    }
  }

  function closeEditor() {
    setEditor(null);
    setTitle("");
    setBody("");
  }

  async function saveReport() {
    if (!title.trim()) {
      setError("Enter a report title (e.g. CXR report).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editor?.mode === "create") {
        await api(`/api/patients/${patientId}/documents/text-report`, {
          method: "POST",
          json: {
            sectionKey,
            name: title.trim(),
            content: body,
          },
        });
      } else if (editor?.mode === "edit") {
        await api(`/api/patients/${patientId}/documents/${editor.doc.id}`, {
          method: "PATCH",
          json: {
            name: title.trim(),
            content: body,
          },
        });
      }
      closeEditor();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save report.");
    } finally {
      setSaving(false);
    }
  }

  async function removeReport(docId: string) {
    setDeletingId(docId);
    setError(null);
    try {
      await api(`/api/patients/${patientId}/documents/${docId}`, {
        method: "DELETE",
        json: { reason: "Deleted written report from chart section" },
      });
      if (editor?.mode === "edit" && editor.doc.id === docId) closeEditor();
      await load();
    } catch {
      setError("Could not delete report.");
    } finally {
      setDeletingId(null);
    }
  }

  if (editor) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#8aa0bd]">
              {editor.mode === "create" ? "New written report" : "Edit written report"}
            </p>
            <p className="text-xs text-[var(--pv-muted)]">
              Saved as its own document in {label} and Documents.
            </p>
          </div>
          <div className="flex gap-2">
            <Button className="!text-xs" disabled={saving} onClick={closeEditor}>
              Cancel
            </Button>
            <Button variant="success" className="!text-xs" disabled={saving || !title.trim()} onClick={() => void saveReport()}>
              {saving ? "Saving..." : "Save report"}
            </Button>
          </div>
        </div>

        <Input
          className="!text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={readOnly || saving}
          placeholder="Report title (e.g. CXR 7/26/2026)"
        />
        <Textarea
          className="min-h-[280px] flex-1 font-mono text-[13px] leading-relaxed"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={readOnly || saving}
          placeholder={`Enter ${label.toLowerCase()} findings / impression...`}
          autoFocus
        />
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#8aa0bd]">
          <FileText size={12} />
          Written reports
          <span className="font-normal normal-case tracking-normal text-[var(--pv-muted)]">
            (each becomes a document)
          </span>
        </div>
        {!readOnly && (
          <Button className="!h-7 !gap-1 !px-2 !text-[11px]" onClick={startCreate}>
            <Plus size={12} /> New report
          </Button>
        )}
      </div>

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      {loading ? (
        <p className="text-[11px] text-[var(--pv-muted)]">Loading reports…</p>
      ) : docs.length === 0 ? (
        <p className="text-[11px] text-[var(--pv-muted)]">
          No written reports yet. Add a CXR, CT, echo, or study interpretation as its own document.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map((doc) => (
            <li
              key={doc.id}
              role="button"
              tabIndex={0}
              onClick={() => void startEdit(doc)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void startEdit(doc);
                }
              }}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--pv-border)] bg-[var(--pv-panel-deep)] px-2.5 py-2 transition",
                "hover:border-cyan-500/35 hover:bg-[color-mix(in_srgb,var(--pv-hover)_70%,transparent)]"
              )}
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-cyan-200">{doc.name}</div>
                <div className="truncate text-[10px] text-[var(--pv-muted)]">
                  Written report · {formatDate(doc.uploadedAt)}
                  {doc.authorName ? ` · ${doc.authorName}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  className="!h-7 !px-2 !text-[11px]"
                  disabled={saving}
                  onClick={() => void startEdit(doc)}
                  title="Edit"
                >
                  <Pencil size={12} />
                </Button>
                {!readOnly && (
                  <Button
                    className="!h-7 !px-2 !text-[11px] !text-rose-300"
                    disabled={deletingId === doc.id}
                    onClick={() => void removeReport(doc.id)}
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
