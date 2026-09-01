"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

/** Note/form "pdf" routes return HTML; fetch + srcdoc avoids blank iframe on auth/errors. */
function shouldFetchHtmlPreview(url: string, mimeType?: string | null) {
  if (mimeType?.startsWith("text/html")) return true;
  if (mimeType?.startsWith("image/")) return false;
  return /\/api\/patients\/[^/]+\/(notes|forms)\/[^/]+\/pdf$/.test(url);
}

export function FullPageDocumentViewer({
  title,
  url,
  mimeType,
  onClose,
  backLabel = "Back",
}: {
  title: string;
  url: string;
  mimeType?: string | null;
  onClose: () => void;
  backLabel?: string;
}) {
  const isImage = Boolean(mimeType?.startsWith("image/"));
  const fetchHtml = shouldFetchHtmlPreview(url, mimeType);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(fetchHtml);

  useEffect(() => {
    if (!fetchHtml) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setHtmlContent(null);

    fetch(url, { credentials: "include" })
      .then(async (res) => {
        const body = await res.text();
        if (!res.ok) {
          try {
            const parsed = JSON.parse(body) as { error?: string };
            throw new Error(parsed.error ?? `Could not load document (${res.status})`);
          } catch {
            throw new Error(body.trim() || `Could not load document (${res.status})`);
          }
        }
        if (!cancelled) setHtmlContent(body);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not load document");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url, fetchHtml]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[var(--pv-bg-deep)]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--pv-border)] bg-[var(--pv-surface)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button className="!text-xs" onClick={onClose}>
            <ArrowLeft size={14} /> {backLabel}
          </Button>
          <h2 className="truncate text-sm font-semibold text-cyan-200">{title}</h2>
        </div>
      </div>
      <div className="min-h-0 flex-1 bg-[var(--pv-bg-deep)] p-3">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={title} className="h-full w-full object-contain" />
        ) : fetchHtml ? (
          loading ? (
            <p className="px-2 text-sm text-[var(--pv-muted)]">Loading document…</p>
          ) : loadError ? (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">
              {loadError}
            </div>
          ) : (
            <iframe
              title={title}
              srcDoc={htmlContent ?? ""}
              className="h-full w-full rounded-lg border border-[var(--pv-border)] bg-white"
            />
          )
        ) : (
          <iframe
            title={title}
            src={url}
            className="h-full w-full rounded-lg border border-[var(--pv-border)] bg-white"
          />
        )}
      </div>
    </div>
  );
}
