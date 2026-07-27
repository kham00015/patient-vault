"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

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

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--pv-bg-deep)]">
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
        ) : (
          <iframe title={title} src={url} className="h-full w-full rounded-lg border border-[var(--pv-border)] bg-white" />
        )}
      </div>
    </div>
  );
}
