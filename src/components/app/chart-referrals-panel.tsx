"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  canAcknowledgeReferrals,
  canAttachReferralsToChart,
  canManageReferrals,
} from "@/lib/referrals";
import type { SessionUser } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { CheckCheck, Download, FileUp, FolderOpen, Printer, Trash2 } from "lucide-react";

type ReferralDoc = {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  imported: boolean;
  importedAt: string | null;
  openUrl: string;
};

type Referral = {
  id: string;
  patientName: string;
  patientId?: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  createdById: string;
  createdByName: string | null;
  createdByOfficeName?: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  assignedToOfficeName?: string | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  documents: ReferralDoc[];
};

type RecipientOption = {
  id: string;
  name: string;
  email: string;
  role: string;
  officeId: string | null;
  officeName: string;
};
type PatientOption = { id: string; name: string; mrn?: string | null };

export function ChartReferralsPanel({
  user,
  patients,
  defaultPatientId,
  onUnreadChange,
}: {
  user: SessionUser;
  patients: PatientOption[];
  defaultPatientId?: string | null;
  onUnreadChange?: (unread: number) => void;
}) {
  const canManage = canManageReferrals(user.role);
  const canAttach = canAttachReferralsToChart(user.role);
  const canAcknowledge = canAcknowledgeReferrals(user.role);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [recipients, setRecipients] = useState<RecipientOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPatientId, setNewPatientId] = useState("");
  const [createPatientQuery, setCreatePatientQuery] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachPatientId, setAttachPatientId] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [fromChartOpen, setFromChartOpen] = useState(false);
  const [fromChartPatientId, setFromChartPatientId] = useState("");
  const [fromChartQuery, setFromChartQuery] = useState("");
  const [chartDocs, setChartDocs] = useState<
    Array<{ id: string; name: string; fileName: string; fileSize: number; kind: string }>
  >([]);
  const [chartDocIds, setChartDocIds] = useState<string[]>([]);
  const [chartDocsLoading, setChartDocsLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => referrals.find((r) => r.id === selectedId) ?? null,
    [referrals, selectedId]
  );

  const refreshUnread = useCallback(async () => {
    if (!canAcknowledge || !onUnreadChange) return;
    try {
      const data = await api<{ unread: number }>("/api/referrals/unread");
      onUnreadChange(data.unread);
    } catch {
      // non-critical
    }
  }, [canAcknowledge, onUnreadChange]);

  const load = useCallback(async () => {
    if (!canManage) return;
    const data = await api<{ referrals: Referral[] }>("/api/referrals");
    setReferrals(data.referrals);
    setSelectedId((current) => {
      if (current && data.referrals.some((r) => r.id === current)) return current;
      return data.referrals[0]?.id ?? null;
    });
    await refreshUnread();
  }, [canManage, refreshUnread]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Could not load referrals."));
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    api<{ recipients: RecipientOption[] }>("/api/referrals/recipients")
      .then((data) => {
        setRecipients(data.recipients);
        setAssignedToId((current) => current || data.recipients[0]?.id || "");
      })
      .catch(() => undefined);
  }, [canManage]);

  useEffect(() => {
    setSelectedDocIds([]);
  }, [selectedId]);

  async function createReferral() {
    if (!assignedToId) {
      setError("Choose who should receive this referral.");
      return;
    }
    if (canAttach) {
      if (!newPatientId) {
        setError("Search and select a patient.");
        return;
      }
    } else if (!newName.trim()) {
      setError("Enter a patient name for this referral.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api<{ referral: Referral }>("/api/referrals", {
        method: "POST",
        json: canAttach
          ? { patientId: newPatientId, assignedToId }
          : { patientName: newName.trim(), assignedToId },
      });
      setNewName("");
      setNewPatientId("");
      setCreatePatientQuery("");
      setReferrals((prev) => [data.referral, ...prev]);
      setSelectedId(data.referral.id);
      await refreshUnread();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create referral.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!selected || !files?.length) return;
    setBusy(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("name", file.name);
        await api(`/api/referrals/${selected.id}/documents`, {
          method: "POST",
          body: form,
        });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeReferral() {
    if (!selected) return;
    if (!window.confirm(`Delete referral for ${selected.patientName}?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/referrals/${selected.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete referral.");
    } finally {
      setBusy(false);
    }
  }

  async function acknowledgeReferral() {
    if (!selected || selected.acknowledged) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<{
        acknowledgedAt: string;
        acknowledgedByName: string | null;
      }>(`/api/referrals/${selected.id}/acknowledge`, { method: "POST" });
      setReferrals((prev) =>
        prev.map((r) =>
          r.id === selected.id
            ? {
                ...r,
                acknowledged: true,
                acknowledgedAt: data.acknowledgedAt,
                acknowledgedByName: data.acknowledgedByName,
              }
            : r
        )
      );
      await refreshUnread();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not acknowledge referral.");
    } finally {
      setBusy(false);
    }
  }

  function toggleDoc(id: string) {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function openAttach() {
    if (!selectedDocIds.length) {
      setError("Select one or more documents first.");
      return;
    }
    setAttachPatientId(defaultPatientId || "");
    setPatientQuery("");
    setAttachOpen(true);
    setError("");
  }

  async function attachToChart() {
    if (!selected || !attachPatientId || !selectedDocIds.length) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/referrals/${selected.id}/attach`, {
        method: "POST",
        json: { patientId: attachPatientId, documentIds: selectedDocIds },
      });
      setAttachOpen(false);
      setSelectedDocIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add to patient chart.");
    } finally {
      setBusy(false);
    }
  }

  const filteredCreatePatients = useMemo(() => {
    const q = createPatientQuery.trim().toLowerCase();
    if (!q) return [];
    return patients
      .filter((p) => `${p.name} ${p.mrn ?? ""}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [patients, createPatientQuery]);

  const filteredPatients = useMemo(() => {
    const q = patientQuery.trim().toLowerCase();
    if (!q) return [];
    return patients
      .filter((p) => `${p.name} ${p.mrn ?? ""}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [patients, patientQuery]);

  const filteredFromChartPatients = useMemo(() => {
    const q = fromChartQuery.trim().toLowerCase();
    if (!q) return [];
    return patients
      .filter((p) => `${p.name} ${p.mrn ?? ""}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [patients, fromChartQuery]);

  const isAssignee = Boolean(selected && selected.assignedToId === user.id);
  const isSender = Boolean(selected && selected.createdById === user.id);
  const showAckForAssignee = Boolean(canAcknowledge && selected && isAssignee);
  const canUploadSelected = Boolean(selected && isSender);
  /** Clinic senders only — attach existing chart files (consultants: upload only). */
  const canAddFromChart = Boolean(canUploadSelected && canAttach);

  async function openFromChart() {
    const preferred =
      selected?.patientId || defaultPatientId || "";
    setFromChartPatientId(preferred);
    setFromChartQuery("");
    setChartDocs([]);
    setChartDocIds([]);
    setFromChartOpen(true);
    setError("");
    if (preferred) {
      await loadChartDocs(preferred);
    }
  }

  async function loadChartDocs(patientId: string) {
    setFromChartPatientId(patientId);
    setChartDocIds([]);
    setChartDocsLoading(true);
    try {
      const data = await api<{
        documents: Array<{
          id: string;
          name: string;
          fileName: string;
          fileSize: number;
          kind: string;
        }>;
      }>(`/api/patients/${patientId}/documents`);
      setChartDocs(
        data.documents.filter((d) => d.kind === "upload" || d.kind === "report")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load chart documents.");
      setChartDocs([]);
    } finally {
      setChartDocsLoading(false);
    }
  }

  function toggleChartDoc(id: string) {
    setChartDocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function addFromChart() {
    if (!selected || !fromChartPatientId || !chartDocIds.length) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/referrals/${selected.id}/documents/from-chart`, {
        method: "POST",
        json: { patientId: fromChartPatientId, documentIds: chartDocIds },
      });
      setFromChartOpen(false);
      setChartDocIds([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add documents from chart.");
    } finally {
      setBusy(false);
    }
  }

  const canDeleteSelected = Boolean(
    selected && (isSender || user.role === "ADMIN")
  );

  if (!canManage) {
    return (
      <div className="p-4 text-sm text-[var(--pv-muted)]">
        Referrals are not available for this account.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row">
      <div className="flex w-full shrink-0 flex-col gap-2 md:w-72 md:border-r md:border-[var(--pv-border)] md:pr-3">
        <p className="text-xs uppercase tracking-wider text-[var(--pv-muted)]">Referrals</p>
        {canAttach ? (
          <div className="space-y-1.5">
            <Input
              value={createPatientQuery}
              onChange={(e) => setCreatePatientQuery(e.target.value)}
              placeholder="Search patient by name or MRN"
            />
            {createPatientQuery.trim() && (
              <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-[var(--pv-border)] p-1">
                {filteredCreatePatients.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setNewPatientId(p.id);
                      setNewName(p.name);
                      setCreatePatientQuery("");
                    }}
                    className={cn(
                      "block w-full rounded-md px-2 py-1.5 text-left text-sm",
                      newPatientId === p.id
                        ? "bg-amber-500/20 text-amber-100"
                        : "text-[var(--pv-fg-soft)] hover:bg-white/5"
                    )}
                  >
                    {p.name}
                    {p.mrn ? ` · ${p.mrn}` : ""}
                  </button>
                ))}
                {filteredCreatePatients.length === 0 && (
                  <p className="px-2 py-2 text-xs text-[var(--pv-muted)]">No matching patients.</p>
                )}
              </div>
            )}
            {newPatientId && (
              <p className="truncate text-xs text-amber-200">Selected: {newName}</p>
            )}
          </div>
        ) : (
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Patient name"
            onKeyDown={(e) => {
              if (e.key === "Enter") void createReferral();
            }}
          />
        )}
        <select
          value={assignedToId}
          onChange={(e) => setAssignedToId(e.target.value)}
          className="h-10 w-full rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 text-sm text-[var(--pv-fg)]"
        >
          <option value="">Send to…</option>
          {recipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.officeName}
            </option>
          ))}
        </select>
        <Button type="button" disabled={busy} onClick={() => void createReferral()}>
          Add referral
        </Button>
        {recipients.length === 0 && (
          <p className="text-xs text-amber-300">
            No clinic users available to receive referrals in this office.
          </p>
        )}
        <div className="mb-1 flex items-center gap-3 px-1 text-[10px] uppercase tracking-wide text-[var(--pv-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-sm border-2 border-[var(--pv-ref-in-border)] bg-[var(--pv-ref-in-bg)]"
            />{" "}
            Incoming
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-sm border-2 border-[var(--pv-ref-out-border)] bg-[var(--pv-ref-out-bg)]"
            />{" "}
            Sent
          </span>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {referrals.length === 0 && (
            <p className="px-1 text-sm text-[var(--pv-muted)]">No referrals yet.</p>
          )}
          {referrals.map((r) => {
            // Sent by me = outgoing (amber). Everything else in my list = incoming (teal).
            const isOutgoing = r.createdById === user.id;
            const isIncoming = !isOutgoing;
            const assignedToMe = r.assignedToId === user.id;
            const isNewForMe = !r.acknowledged && assignedToMe;
            const selected = selectedId === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={cn(
                  "block w-full rounded-lg px-2.5 py-2 text-left text-sm transition",
                  isIncoming && "bg-[var(--pv-ref-in-bg)] text-[var(--pv-fg)]",
                  isOutgoing && "bg-[var(--pv-ref-out-bg)] text-[var(--pv-fg)]",
                  selected
                    ? "border border-[var(--pv-accent)] shadow-md brightness-[1.02]"
                    : "border border-transparent opacity-80 hover:opacity-100"
                )}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                      isIncoming &&
                        "bg-[var(--pv-ref-in-badge)] text-[var(--pv-fg)]",
                      isOutgoing &&
                        "bg-[var(--pv-ref-out-badge)] text-[var(--pv-fg)]"
                    )}
                  >
                    {isIncoming ? "Incoming" : "Sent"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{r.patientName}</span>
                  {isNewForMe && (
                    <span className="shrink-0 rounded-full bg-[var(--pv-ref-in-border)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                      New
                    </span>
                  )}
                  {isOutgoing && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        r.acknowledged
                          ? "bg-emerald-600/20 text-emerald-700 dark:text-emerald-300"
                          : "bg-[var(--pv-ref-out-badge)] text-[var(--pv-fg)]"
                      )}
                    >
                      {r.acknowledged ? "Ack’d" : "Pending"}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--pv-muted)]">
                  {isOutgoing
                    ? `To ${r.assignedToName ?? "—"}${r.assignedToOfficeName ? ` (${r.assignedToOfficeName})` : ""}`
                    : `From ${r.createdByName ?? "—"}${r.createdByOfficeName ? ` (${r.createdByOfficeName})` : ""}`}
                  {" · "}
                  {r.documents.length} doc{r.documents.length === 1 ? "" : "s"}
                  {isOutgoing
                    ? r.acknowledged
                      ? " · acknowledged"
                      : " · not acknowledged yet"
                    : assignedToMe
                      ? r.acknowledged
                        ? " · acknowledged"
                        : " · needs your acknowledgement"
                      : r.acknowledged
                        ? " · acknowledged"
                        : " · pending acknowledgement"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        {error && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {error}
          </p>
        )}
        {!selected ? (
          <p className="text-sm text-[var(--pv-muted)]">
            Add a patient name, choose who receives it, then upload documents.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                      isSender && !isAssignee && "bg-amber-500/20 text-amber-200",
                      isAssignee && "bg-cyan-500/20 text-cyan-200",
                      !isSender && !isAssignee && "bg-white/10 text-[var(--pv-muted)]"
                    )}
                  >
                    {isAssignee ? "Incoming" : isSender ? "Outgoing" : "Referral"}
                  </span>
                  {isSender && (
                    <span
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[11px] font-medium",
                        selected.acknowledged
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-200"
                      )}
                    >
                      {selected.acknowledged ? "Acknowledged" : "Not acknowledged yet"}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-medium text-[var(--pv-fg)]">{selected.patientName}</h3>
                <p className="text-xs text-[var(--pv-muted)]">
                  {selected.createdByName
                    ? `From ${selected.createdByName}${selected.createdByOfficeName ? ` (${selected.createdByOfficeName})` : ""}`
                    : "From —"}
                  {selected.assignedToName
                    ? ` · To ${selected.assignedToName}${selected.assignedToOfficeName ? ` (${selected.assignedToOfficeName})` : ""}`
                    : ""}
                  {` · ${new Date(selected.createdAt).toLocaleString()}`}
                </p>
                {selected.acknowledged ? (
                  <p className="mt-0.5 text-xs text-emerald-400">
                    {isSender ? "Recipient acknowledged" : "Acknowledged"}
                    {selected.acknowledgedByName ? ` by ${selected.acknowledgedByName}` : ""}
                    {selected.acknowledgedAt
                      ? ` · ${new Date(selected.acknowledgedAt).toLocaleString()}`
                      : ""}
                  </p>
                ) : isSender ? (
                  <p className="mt-0.5 text-xs text-amber-300">
                    Waiting for acknowledgement
                    {selected.assignedToName ? ` from ${selected.assignedToName}` : ""}
                  </p>
                ) : isAssignee ? (
                  <p className="mt-0.5 text-xs text-cyan-300">
                    Incoming package — use Acknowledge when you have received it
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(e) => void uploadFiles(e.target.files)}
                />
                {canUploadSelected && (
                  <Button
                    type="button"
                    disabled={busy}
                    className="!gap-1.5"
                    onClick={() => fileRef.current?.click()}
                  >
                    <FileUp size={16} /> Upload
                  </Button>
                )}
                {canAddFromChart && (
                  <Button
                    type="button"
                    disabled={busy}
                    className="!gap-1.5"
                    onClick={() => void openFromChart()}
                  >
                    <FolderOpen size={16} /> From documents
                  </Button>
                )}
                {showAckForAssignee && (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy || Boolean(selected?.acknowledged)}
                    className="!gap-1.5"
                    onClick={() => void acknowledgeReferral()}
                  >
                    <CheckCheck size={16} />
                    {selected?.acknowledged ? "Acknowledged" : "Acknowledge"}
                  </Button>
                )}
                {canAttach && (
                  <Button
                    type="button"
                    variant="success"
                    disabled={busy || selectedDocIds.length === 0}
                    onClick={openAttach}
                  >
                    Add to patient chart
                  </Button>
                )}
                {canDeleteSelected && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    className="!text-rose-300"
                    onClick={() => void removeReferral()}
                  >
                    <Trash2 size={16} />
                  </Button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-xl border border-[var(--pv-border)] p-2">
              {selected.documents.length === 0 && (
                <p className="p-2 text-sm text-[var(--pv-muted)]">No documents uploaded yet.</p>
              )}
              {!canAttach && selected.documents.length > 0 && (
                <p className="mb-1 px-2 text-xs text-[var(--pv-muted)]">
                  Open, print, or download files here. Adding to a patient chart is clinic-only.
                </p>
              )}
              {selected.documents.map((doc) => {
                const checked = selectedDocIds.includes(doc.id);
                const downloadUrl = `${doc.openUrl}?download=1`;
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/5"
                  >
                    {canAttach && (
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={doc.imported}
                        onChange={() => toggleDoc(doc.id)}
                        aria-label={`Select ${doc.name}`}
                      />
                    )}
                    <a
                      href={doc.openUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-sm text-cyan-300 hover:underline"
                      title="Open / print preview"
                    >
                      {doc.name}
                    </a>
                    <span className="shrink-0 text-xs text-[var(--pv-muted)]">
                      {doc.imported ? "In chart" : `${Math.round(doc.fileSize / 1024)} KB`}
                    </span>
                    <a
                      href={doc.openUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--pv-muted-2)] hover:bg-[var(--pv-hover)] hover:text-[var(--pv-fg)]"
                      title="Open / print"
                      aria-label={`Open ${doc.name}`}
                    >
                      <Printer size={14} />
                    </a>
                    <a
                      href={downloadUrl}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--pv-muted-2)] hover:bg-[var(--pv-hover)] hover:text-[var(--pv-fg)]"
                      title="Download"
                      aria-label={`Download ${doc.name}`}
                      download={doc.fileName}
                    >
                      <Download size={14} />
                    </a>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Modal open={attachOpen} onClose={() => setAttachOpen(false)} title="Add to patient chart">
        <div className="space-y-3">
          <p className="text-sm text-[var(--pv-muted-2)]">
            {selectedDocIds.length} document{selectedDocIds.length === 1 ? "" : "s"} will be copied
            into the selected patient&apos;s Documents.
          </p>
          <Input
            value={patientQuery}
            onChange={(e) => setPatientQuery(e.target.value)}
            placeholder="Search patient by name or MRN"
          />
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[var(--pv-border)] p-1">
            {!patientQuery.trim() && (
              <p className="px-2 py-3 text-sm text-[var(--pv-muted)]">
                Search by name or MRN to find a patient.
              </p>
            )}
            {filteredPatients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setAttachPatientId(p.id)}
                className={cn(
                  "block w-full rounded-md px-2 py-1.5 text-left text-sm",
                  attachPatientId === p.id
                    ? "bg-cyan-500/20 text-cyan-100"
                    : "text-[var(--pv-fg-soft)] hover:bg-white/5"
                )}
              >
                {p.name}
                {p.mrn ? ` · ${p.mrn}` : ""}
              </button>
            ))}
            {patientQuery.trim() && filteredPatients.length === 0 && (
              <p className="px-2 py-3 text-sm text-[var(--pv-muted)]">No matching patients.</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAttachOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !attachPatientId}
              onClick={() => void attachToChart()}
            >
              {busy ? "Copying…" : "Add to chart"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={fromChartOpen}
        onClose={() => setFromChartOpen(false)}
        title="Add from patient documents"
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--pv-muted-2)]">
            Choose a patient, then click documents to attach them to this referral.
          </p>
          <Input
            value={fromChartQuery}
            onChange={(e) => setFromChartQuery(e.target.value)}
            placeholder="Search patient by name or MRN"
          />
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-[var(--pv-border)] p-1">
            {!fromChartQuery.trim() && (
              <p className="px-2 py-3 text-sm text-[var(--pv-muted)]">
                Search by name or MRN to find a patient.
              </p>
            )}
            {filteredFromChartPatients.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void loadChartDocs(p.id)}
                className={cn(
                  "block w-full rounded-md px-2 py-1.5 text-left text-sm",
                  fromChartPatientId === p.id
                    ? "bg-cyan-500/20 text-cyan-100"
                    : "text-[var(--pv-fg-soft)] hover:bg-white/5"
                )}
              >
                {p.name}
                {p.mrn ? ` · ${p.mrn}` : ""}
              </button>
            ))}
            {fromChartQuery.trim() && filteredFromChartPatients.length === 0 && (
              <p className="px-2 py-3 text-sm text-[var(--pv-muted)]">No matching patients.</p>
            )}
          </div>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[var(--pv-border)] p-1">
            {!fromChartPatientId && (
              <p className="px-2 py-3 text-sm text-[var(--pv-muted)]">Select a patient first.</p>
            )}
            {fromChartPatientId && chartDocsLoading && (
              <p className="px-2 py-3 text-sm text-[var(--pv-muted)]">Loading documents…</p>
            )}
            {fromChartPatientId && !chartDocsLoading && chartDocs.length === 0 && (
              <p className="px-2 py-3 text-sm text-[var(--pv-muted)]">No uploaded documents on this chart.</p>
            )}
            {chartDocs.map((doc) => {
              const checked = chartDocIds.includes(doc.id);
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => toggleChartDoc(doc.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    checked
                      ? "bg-cyan-500/20 text-cyan-100"
                      : "text-[var(--pv-fg-soft)] hover:bg-white/5"
                  )}
                >
                  <input type="checkbox" readOnly checked={checked} className="pointer-events-none" />
                  <span className="min-w-0 flex-1 truncate">{doc.name}</span>
                  <span className="shrink-0 text-xs text-[var(--pv-muted)]">
                    {Math.round(doc.fileSize / 1024)} KB
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setFromChartOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !fromChartPatientId || chartDocIds.length === 0}
              onClick={() => void addFromChart()}
            >
              {busy
                ? "Adding…"
                : `Add ${chartDocIds.length || ""} doc${chartDocIds.length === 1 ? "" : "s"}`.trim()}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
