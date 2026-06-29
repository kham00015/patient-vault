"use client";

import { Button } from "@/components/ui/button";
import type { FaxTransmissionDTO } from "@/lib/fax-transmissions";
import { cn, formatDate } from "@/lib/utils";
import { FileText, Printer } from "lucide-react";

function FaxStatusBadge({ status }: { status: FaxTransmissionDTO["status"] }) {
  const styles: Record<FaxTransmissionDTO["status"], string> = {
    QUEUED: "bg-amber-500/15 text-amber-300",
    SENDING: "bg-sky-500/15 text-sky-300",
    DELIVERED: "bg-emerald-500/15 text-emerald-300",
    FAILED: "bg-rose-500/15 text-rose-300",
  };
  const labels: Record<FaxTransmissionDTO["status"], string> = {
    QUEUED: "Queued",
    SENDING: "Sending",
    DELIVERED: "Delivered",
    FAILED: "Failed",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase", styles[status])}>
      {labels[status]}
    </span>
  );
}

export function CommsBranchPanel({
  patientId,
  faxes,
  documents,
  isReadOnly,
  onSendFax,
}: {
  patientId: string;
  faxes: FaxTransmissionDTO[];
  documents: { id: string; name: string; fileName: string }[];
  isReadOnly: boolean;
  onSendFax: (documentId?: string) => void;
}) {
  return (
    <div className="mt-1.5 rounded-md border border-[#243044] bg-[#121820]/80 p-2">
      {!isReadOnly && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[#243044] pb-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-cyan-200">
            Outbound faxes
          </span>
          <Button
            variant="success"
            className="!h-7 !text-[10px]"
            disabled={documents.length === 0}
            onClick={() => onSendFax()}
          >
            <Printer size={12} /> Send Fax
          </Button>
        </div>
      )}

      {documents.length === 0 && (
        <p className="mb-2 text-xs text-[#6b7c93]">
          Upload a file in Files first, then fax it from here.
        </p>
      )}

      {faxes.length === 0 ? (
        <p className="py-1 text-xs text-[#6b7c93]">No faxes sent for this encounter yet.</p>
      ) : (
        <div className="space-y-1">
          {faxes.map((fax) => (
            <div
              key={fax.id}
              className="rounded border border-[#243044] bg-[#0f1520] px-2 py-1.5"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-cyan-200">
                  {fax.toName || fax.toNumber}
                </span>
                <FaxStatusBadge status={fax.status} />
                {fax.pageCount != null && (
                  <span className="text-[9px] text-[#6b7c93]">{fax.pageCount} pg</span>
                )}
              </div>
              <div className="mt-0.5 text-[10px] text-[#6b7c93]">
                {fax.document.name} · {formatDate(fax.sentAt ?? fax.createdAt)}
                {fax.sentByName ? ` · by ${fax.sentByName}` : ""}
              </div>
              {fax.failureReason && (
                <div className="mt-0.5 text-[10px] text-rose-300">{fax.failureReason}</div>
              )}
              <div className="mt-1.5 flex gap-1">
                <Button
                  className="!h-7 !px-2 !text-[10px]"
                  onClick={() =>
                    window.open(`/api/patients/${patientId}/documents/${fax.documentId}`, "_blank")
                  }
                >
                  <FileText size={11} /> Document
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
