"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, FileUp, Loader2, Search, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LEGAL_CATEGORIES,
  formatLegalFileSize,
  getLegalCategoryLabel,
  type LegalCategoryValue,
  type LegalDocumentDTO,
} from "@/lib/legal";
import { cn } from "@/lib/utils";

function formatUploadedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function LegalPanel() {
  const [documents, setDocuments] = useState<LegalDocumentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [uploadCategory, setUploadCategory] = useState<LegalCategoryValue>("BAA");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (categoryFilter) params.set("category", categoryFilter);
      const qs = params.toString();
      const data = await api<{ documents: LegalDocumentDTO[] }>(
        `/api/legal/documents${qs ? `?${qs}` : ""}`
      );
      setDocuments(data.documents);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load legal documents");
    } finally {
      setLoading(false);
    }
  }, [query, categoryFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadFiles(fileList: FileList | File[] | null) {
    if (!fileList || (Array.isArray(fileList) ? fileList.length === 0 : fileList.length === 0)) {
      return;
    }
    const files = Array.from(fileList);
    setUploading(true);
    setError("");
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("title", file.name.replace(/\.[^.]+$/, "") || file.name);
        form.append("category", uploadCategory);
        const res = await fetch("/api/legal/documents", { method: "POST", body: form });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? `Upload failed for ${file.name}`);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload");
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc(doc: LegalDocumentDTO) {
    if (!window.confirm(`Delete “${doc.title}”? This cannot be undone.`)) return;
    try {
      await api(`/api/legal/documents/${doc.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <p className="text-sm text-[var(--pv-muted-2)]">
        Store BAAs, policies, and other legal documents for this clinic. Visible only to admins and
        master admins.
      </p>

      <div
        className={cn(
          "rounded-xl border border-dashed px-4 py-8 text-center transition",
          dragOver
            ? "border-cyan-400 bg-cyan-500/10"
            : "border-[var(--pv-border-strong)] bg-[var(--pv-panel)]/50"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          void uploadFiles(e.dataTransfer.files);
        }}
      >
        <FileUp className="mx-auto mb-2 text-cyan-300/80" size={28} />
        <p className="text-sm text-[var(--pv-fg-soft)]">
          {uploading ? "Uploading…" : "Drop legal documents here, or choose files"}
        </p>
        <p className="mt-1 text-xs text-[var(--pv-muted)]">
          PDF, Word, text, or images — up to 25MB each
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <label className="text-xs text-[var(--pv-muted)]">
            Category
            <select
              className="ml-2 rounded-md border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-2 py-1.5 text-sm text-[var(--pv-fg)]"
              value={uploadCategory}
              disabled={uploading}
              onChange={(e) => setUploadCategory(e.target.value as LegalCategoryValue)}
            >
              {LEGAL_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            className="!text-xs"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Choose files
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,application/pdf,image/*,text/*"
          onChange={(e) => {
            void uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--pv-muted)]"
          />
          <Input
            className="!pl-8"
            placeholder="Search title or filename…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 py-2 text-sm"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {LEGAL_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--pv-border)]">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--pv-muted)]">Loading…</p>
        ) : documents.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--pv-muted)]">
            No legal documents yet. Drop a BAA or policy above to get started.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--pv-border)]">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-[var(--pv-hover)]"
              >
                <FileText size={18} className="shrink-0 text-amber-300/90" />
                <div className="min-w-0 flex-1">
                  <a
                    href={doc.openUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium text-cyan-300 hover:underline"
                  >
                    {doc.title}
                  </a>
                  <p className="mt-0.5 truncate text-xs text-[var(--pv-muted)]">
                    {getLegalCategoryLabel(doc.category)} · {doc.fileName} ·{" "}
                    {formatLegalFileSize(doc.fileSize)} · {formatUploadedAt(doc.uploadedAt)}
                    {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="!h-8 !w-8 !p-0 text-[var(--pv-muted)] hover:text-rose-300"
                  aria-label={`Delete ${doc.title}`}
                  onClick={() => void removeDoc(doc)}
                >
                  <Trash2 size={15} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
