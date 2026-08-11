"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FullPageDocumentViewer } from "@/components/app/full-page-document-viewer";
import {
  DOCUMENT_SECTION_LABELS,
  isTextReportDocument,
  type DocumentUploadSectionKey,
} from "@/lib/document-sections";
import { formatDate, cn } from "@/lib/utils";
import { FileUp, Trash2, Eye } from "lucide-react";
import { ScanDocumentButton } from "@/components/app/document-scan-modal";

type SectionDoc = {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  openUrl?: string;
};

/** Upload / list result files for a chart or note section. Files also appear in Documents. */
export function SectionDocumentUploads({
  patientId,
  sectionKey,
  noteId,
  readOnly,
  compact = false,
}: {
  patientId: string;
  sectionKey: DocumentUploadSectionKey;
  noteId?: string | null;
  readOnly: boolean;
  compact?: boolean;
}) {
  const [docs, setDocs] = useState<SectionDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerDoc, setViewerDoc] = useState<SectionDoc | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const label = DOCUMENT_SECTION_LABELS[sectionKey];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ sectionKey });
      if (noteId) qs.set("noteId", noteId);
      const data = await api<{ documents: SectionDoc[] }>(
        `/api/patients/${patientId}/documents?${qs.toString()}`
      );
      // Written reports are managed separately — this list is file uploads only.
      setDocs((data.documents ?? []).filter((d) => !isTextReportDocument(d)));
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [patientId, noteId, sectionKey]);

  useEffect(() => {
    void load();
  }, [load]);

  function onFileSelected(selected: File | null) {
    setFile(selected);
    setError(null);
    if (selected && !name.trim()) {
      setName(selected.name.replace(/\.[^.]+$/, "") || selected.name);
    }
  }

  async function upload() {
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    if (!name.trim()) {
      setError("Enter a document name.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name.trim());
      fd.append("sectionKey", sectionKey);
      if (noteId) fd.append("noteId", noteId);
      const res = await fetch(`/api/patients/${patientId}/documents/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? `Upload failed (${res.status}).`);
        return;
      }
      setName("");
      setFile(null);
      setFileInputKey((k) => k + 1);
      await load();
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc(docId: string) {
    setDeletingId(docId);
    setError(null);
    try {
      await api(`/api/patients/${patientId}/documents/${docId}`, { method: "DELETE" });
      if (viewerDoc?.id === docId) setViewerDoc(null);
      await load();
    } catch {
      setError("Could not delete document.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div
      className={cn(
        "space-y-2",
        compact ? "mb-0" : "rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] p-3"
      )}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#8aa0bd]">
        <FileUp size={12} />
        Upload {label} results
        <span className="font-normal normal-case tracking-normal text-[var(--pv-muted)]">
          (also in Documents)
        </span>
      </div>

      {!readOnly && (
        <div className="grid gap-1.5 sm:grid-cols-[1fr_1fr_auto_auto]">
          <Input
            className="!h-8 !text-xs"
            placeholder={`${label} document name`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
          <Input
            key={fileInputKey}
            className="!h-8 !text-xs"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.doc,.docx,application/pdf,image/*"
            onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
          />
          <ScanDocumentButton
            defaultName={name.trim() || label}
            className="!h-8 !gap-1.5 !text-xs"
            onCaptured={(scanned, suggestedName) => {
              setFile(scanned);
              setError(null);
              if (!name.trim()) setName(suggestedName);
              setFileInputKey((k) => k + 1);
            }}
          />
          <Button
            variant="success"
            className="!h-8 !text-xs"
            disabled={uploading || !file || !name.trim()}
            onClick={upload}
          >
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      )}

      {file && (
        <p className="text-[11px] text-[var(--pv-muted)]">
          Selected: {file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)
        </p>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}

      {loading ? (
        <p className="text-[11px] text-[var(--pv-muted)]">Loading uploads…</p>
      ) : docs.length === 0 ? (
        <p className="text-[11px] text-[var(--pv-muted)]">No files uploaded for this section yet.</p>
      ) : (
        <ul className="space-y-1">
          {docs.map((doc) => (
            <li
              key={doc.id}
              role="button"
              tabIndex={0}
              onClick={() => setViewerDoc(doc)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setViewerDoc(doc);
                }
              }}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--pv-border)] bg-[var(--pv-panel-deep)] px-2.5 py-1.5 transition hover:border-cyan-500/35 hover:bg-[color-mix(in_srgb,var(--pv-hover)_70%,transparent)]"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-cyan-200">{doc.name}</div>
                <div className="truncate text-[10px] text-[var(--pv-muted)]">
                  {doc.fileName} · {formatDate(doc.uploadedAt)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  className="!h-7 !px-2 !text-[11px]"
                  onClick={() => setViewerDoc(doc)}
                  title="View"
                >
                  <Eye size={12} />
                </Button>
                {!readOnly && (
                  <Button
                    className="!h-7 !px-2 !text-[11px] !text-rose-300"
                    disabled={deletingId === doc.id}
                    onClick={() => void removeDoc(doc.id)}
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

      {viewerDoc && (
        <FullPageDocumentViewer
          title={viewerDoc.name}
          url={viewerDoc.openUrl ?? `/api/patients/${patientId}/documents/${viewerDoc.id}`}
          mimeType={viewerDoc.mimeType}
          onClose={() => setViewerDoc(null)}
        />
      )}
    </div>
  );
}
