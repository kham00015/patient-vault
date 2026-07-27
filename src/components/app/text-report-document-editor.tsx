"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft } from "lucide-react";

/** Full-page editor for written report documents (text/plain). */
export function TextReportDocumentEditor({
  patientId,
  documentId,
  title: initialTitle,
  readOnly = false,
  onClose,
  onSaved,
  backLabel = "Back",
}: {
  patientId: string;
  documentId: string;
  title: string;
  readOnly?: boolean;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
  backLabel?: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/patients/${patientId}/documents/${documentId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Could not load report");
        const text = await res.text();
        if (!cancelled) {
          setBody(text);
          setDirty(false);
        }
      } catch {
        if (!cancelled) setError("Could not load report content.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, documentId]);

  async function save() {
    if (!title.trim()) {
      setError("Report title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/api/patients/${patientId}/documents/${documentId}`, {
        method: "PATCH",
        json: { name: title.trim(), content: body },
      });
      setDirty(false);
      await onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save report.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--pv-bg-deep)]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button className="!text-xs" onClick={onClose}>
            <ArrowLeft size={14} /> {backLabel}
          </Button>
          <Input
            className="max-w-xl !text-sm"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            disabled={readOnly || saving || loading}
          />
        </div>
        {!readOnly && (
          <Button
            variant="success"
            className="!text-xs"
            disabled={saving || loading || !dirty}
            onClick={() => void save()}
          >
            {saving ? "Saving..." : dirty ? "Save report" : "Saved"}
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 p-4">
        {loading ? (
          <p className="text-sm text-[var(--pv-muted)]">Loading report…</p>
        ) : (
          <Textarea
            className="h-full min-h-[60vh] font-mono text-[13px] leading-relaxed"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setDirty(true);
            }}
            disabled={readOnly || saving}
            placeholder="Report findings / impression..."
          />
        )}
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
