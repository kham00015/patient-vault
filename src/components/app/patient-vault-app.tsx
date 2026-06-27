"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/auth";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import { MEDICAL_SECTIONS, type MedicalSectionKey } from "@/lib/patients";
import {
  getNoteTypeLabel,
  type NoteType,
} from "@/lib/notes";
import { flattenNoteForDisplay, parseNoteContent } from "@/lib/note-content";
import { AddPatientModal } from "@/components/app/add-patient-modal";
import { ArchivePatientModal, HardDeletePatientModal } from "@/components/app/archive-patient-modal";
import { StructuredNoteEditor } from "@/components/app/structured-note-editor";
import { ChartEncountersPanel } from "@/components/app/chart-encounters-panel";
import { ChartDiagnosisPanel } from "@/components/app/chart-diagnosis-panel";
import { MessagingPanel } from "@/components/app/messaging-panel";
import { PatientRemindersModal } from "@/components/app/patient-reminders-modal";
import { RemindersPanel } from "@/components/app/reminders-panel";
import { CLINIC_NAME } from "@/lib/branding";
import { DeleteReasonModal } from "@/components/app/delete-reason-modal";
import { formatEncounterLabel } from "@/lib/encounters";
import type { PatientChartInsertSnapshot } from "@/lib/note-chart-map";
import type { CreatePatientInput } from "@/lib/patient-registration";
import type { ArchivePatientInput } from "@/lib/patient-lifecycle";
import {
  calculateAge,
  formatDisplayName,
  formatSexAtBirth,
} from "@/lib/patient-registration";
import { cn, formatDate, formatDateOnly, toDateInputValue } from "@/lib/utils";
import { AutoSaveStatus, useDebouncedCallback } from "@/lib/use-debounced-callback";
import {
  Archive,
  Bot,
  Calendar,
  ClipboardList,
  FileText,
  List,
  LogOut,
  MessageSquare,
  Bell,
  Plus,
  Search,
  Stethoscope,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

type Patient = {
  id: string;
  mrn?: string | null;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  dateOfBirth?: string | null;
  sexAtBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  primaryInsuranceCarrier?: string | null;
  primaryInsuranceMemberId?: string | null;
  primaryInsuranceGroupNumber?: string | null;
  allergies?: string | null;
  currentMedications?: string | null;
  diagnosis?: string | null;
  pmh?: string | null;
  echo?: string | null;
  pft?: string | null;
  sleep?: string | null;
  labs?: string | null;
  imaging?: string | null;
  medications?: string | null;
  social?: string | null;
  status?: string;
  archivedAt?: string | null;
  updatedAt: string;
};

type Note = {
  id: string;
  date: string;
  content: string;
  type: NoteType;
  status?: "DRAFT" | "SIGNED";
  signedAt?: string | null;
  encounterId?: string | null;
  encounter?: { id: string; visitCategory: string; modality: string; date: string } | null;
};
type PatientList = { id: string; name: string; patients: { id: string; name: string }[] };
type DocumentItem = {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  encounterId?: string | null;
  encounter?: { id: string; visitCategory: string; modality: string; date: string } | null;
};

type ChartTab = "encounters" | "notes" | "documents" | MedicalSectionKey;

function buildChartCopyText(patient: Patient, clinicalNotes: Note[]) {
  const lines: string[] = [formatDisplayName(patient)];
  if (patient.mrn) lines.push(`MRN: ${patient.mrn}`);
  for (const section of MEDICAL_SECTIONS) {
    const val = patient[section.key as keyof Patient];
    if (typeof val === "string" && val.trim()) {
      lines.push("", `=== ${section.label} ===`, val);
    }
  }
  if (clinicalNotes.length > 0) {
    lines.push("", "=== Clinical Notes ===");
    for (const note of clinicalNotes) {
      const preview = flattenNoteForDisplay(note.type, parseNoteContent(note.type, note.content));
      const encounterLabel = note.encounter
        ? ` · ${formatEncounterLabel(note.encounter.visitCategory, note.encounter.modality)} ${formatDateOnly(note.encounter.date)}`
        : "";
      const signLabel = note.status === "SIGNED" ? " [Signed]" : " [Draft]";
      lines.push(
        `${formatDate(note.date)} · ${getNoteTypeLabel(note.type)}${encounterLabel}${signLabel}:`,
        preview || "(empty)",
        ""
      );
    }
  }
  return lines.join("\n");
}

const CHART_TABS: { id: ChartTab; label: string; shortLabel: string }[] = [
  { id: "encounters", label: "Encounters", shortLabel: "Encounters" },
  { id: "notes", label: "Notes", shortLabel: "Notes" },
  ...MEDICAL_SECTIONS.map((s) => ({
    id: s.key as ChartTab,
    label: s.label,
    shortLabel: s.label.split(" ")[0],
  })),
  { id: "documents", label: "Documents", shortLabel: "Documents" },
];

type MainView = "chart" | "schedule" | "lists" | "messages" | "reminders";

type ModalType =
  | "patients"
  | "add"
  | "archive"
  | "hardDelete"
  | "upload"
  | "ai"
  | "audit"
  | "reminders"
  | null;

export default function PatientVaultApp({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [current, setCurrent] = useState<Patient | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [modal, setModal] = useState<ModalType>(null);
  const [mainView, setMainView] = useState<MainView>("chart");
  const [chartTab, setChartTab] = useState<ChartTab>("encounters");
  const [toast, setToast] = useState({ message: "", type: "info" as "info" | "success" | "error" });
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingReminders, setPendingReminders] = useState(0);
  const [remindersRefreshKey, setRemindersRefreshKey] = useState(0);

  const notify = (message: string, type: "info" | "success" | "error" = "info") =>
    setToast({ message, type });

  const loadPatients = useCallback(async (q = "", archived = includeArchived) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (archived && user.role === "ADMIN") params.set("includeArchived", "1");
    const qs = params.toString();
    const data = await api<{ patients: Patient[] }>(`/api/patients${qs ? `?${qs}` : ""}`);
    setPatients(data.patients);
  }, [includeArchived, user.role]);

  const selectPatient = useCallback(async (patient: Patient) => {
    try {
      const data = await api<{ patient: Patient }>(`/api/patients/${patient.id}`);
      const notesData = await api<{ notes: Note[] }>(`/api/patients/${patient.id}/notes`);
      setCurrent(data.patient);
      setNotes(notesData.notes);
      setChartTab("encounters");
      setMainView("chart");
      setModal(null);
      notify(`Opened ${formatDisplayName(data.patient)}`, "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to open patient chart", "error");
    }
  }, []);

  useEffect(() => {
    loadPatients().catch((e) => notify(e.message, "error"));
  }, [loadPatients]);

  const refreshUnreadMessages = useCallback(async () => {
    try {
      const data = await api<{ unread: number }>("/api/messages/unread");
      setUnreadMessages(data.unread);
    } catch {
      // messaging not critical for app shell
    }
  }, []);

  useEffect(() => {
    refreshUnreadMessages().catch(() => undefined);
  }, [refreshUnreadMessages]);

  const refreshReminderSummary = useCallback(async () => {
    try {
      const data = await api<{ pending: number; overdue: number }>("/api/reminders/summary");
      setPendingReminders(data.pending);
    } catch {
      // non-critical
    }
  }, []);

  const bumpReminders = useCallback(() => {
    setRemindersRefreshKey((k) => k + 1);
    refreshReminderSummary().catch(() => undefined);
  }, [refreshReminderSummary]);

  useEffect(() => {
    refreshReminderSummary().catch(() => undefined);
  }, [refreshReminderSummary]);

  const canRemoveRecords = user.role === "ADMIN" || user.role === "CLINICIAN";

  async function logout() {
    await api("/api/auth/login", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  async function addPatient(data: CreatePatientInput) {
    const result = await api<{ patient: Patient }>("/api/patients", {
      method: "POST",
      json: data,
    });
    await loadPatients();
    await selectPatient(result.patient);
    notify(`Patient registered — ${result.patient.mrn ?? "MRN assigned"}`, "success");
  }

  const isChartReadOnly = current?.status && current.status !== "ACTIVE";

  async function archivePatient(data: ArchivePatientInput) {
    if (!current) return;
    await api(`/api/patients/${current.id}/archive`, { method: "POST", json: data });
    setCurrent(null);
    setNotes([]);
    await loadPatients(search);
    setModal(null);
    notify("Patient chart archived — data retained for compliance", "success");
  }

  async function hardDeletePatient(data: { reason: string; mrnConfirm: string }) {
    if (!current) return;
    await api(`/api/patients/${current.id}`, { method: "DELETE", json: data });
    setCurrent(null);
    setNotes([]);
    await loadPatients(search);
    setModal(null);
    notify("Patient chart permanently deleted", "success");
  }

  async function restorePatient() {
    if (!current) return;
    try {
      const data = await api<{ patient: Patient }>(`/api/patients/${current.id}/restore`, { method: "POST" });
      setCurrent(data.patient);
      await loadPatients(search, includeArchived);
      notify("Patient chart restored to active", "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }


  async function saveSection(value: string, reason?: string, silent = false) {
    if (!current || chartTab === "encounters" || chartTab === "notes" || chartTab === "documents") return;
    try {
      const data = await api<{ patient: Patient }>(`/api/patients/${current.id}`, {
        method: "PATCH",
        json: { [chartTab]: value, ...(reason ? { reason } : {}) },
      });
      setCurrent(data.patient);
      if (!silent) notify(value.trim() ? "Saved" : "Section cleared", "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Save failed", "error");
    }
  }

  async function refreshNotes() {
    if (!current) return;
    const data = await api<{ notes: Note[] }>(`/api/patients/${current.id}/notes`);
    setNotes(data.notes);
  }

  const chartCopyText = useMemo(
    () => (current ? buildChartCopyText(current, notes) : ""),
    [current, notes]
  );

  const chartInsertData = useMemo(
    () => ({
      pmh: current?.pmh,
      social: current?.social,
      medications: current?.medications,
      labs: current?.labs,
      imaging: current?.imaging,
    }),
    [current?.pmh, current?.social, current?.medications, current?.labs, current?.imaging]
  );

  const menuItems = [
    { id: "patients", label: "Patient List", icon: Users, color: "text-sky-400" },
    { id: "add", label: "Add Patient", icon: Plus, color: "text-emerald-400" },
    {
      id: "archive",
      label: "Archive Chart",
      icon: Archive,
      color: "text-amber-400",
      disabled: !current || isChartReadOnly,
      hidden: user.role === "STAFF" || user.role === "READONLY",
    },
    {
      id: "hardDelete",
      label: "Permanently Delete",
      icon: Trash2,
      color: "text-rose-400",
      disabled: !current,
      hidden: user.role !== "ADMIN",
    },
    { id: "ai", label: "Ask AI", icon: Bot, color: "text-violet-400", disabled: !current },
    { id: "schedule", label: "Clinic Schedule", icon: Calendar, color: "text-amber-400" },
    { id: "lists", label: "Lists", icon: List, color: "text-fuchsia-400" },
    { id: "messages", label: "Messages", icon: MessageSquare, color: "text-sky-300" },
    { id: "reminders", label: "Reminders", icon: Bell, color: "text-orange-300" },
  ] as const;

  function handleNavClick(id: (typeof menuItems)[number]["id"] | "audit") {
    if (id === "schedule") {
      setMainView("schedule");
      setModal(null);
      return;
    }
    if (id === "lists") {
      setMainView("lists");
      setModal(null);
      return;
    }
    if (id === "messages") {
      setMainView("messages");
      setModal(null);
      return;
    }
    if (id === "reminders") {
      setMainView("reminders");
      setModal(null);
      return;
    }
    setModal(id as ModalType);
  }

  return (
    <div className="flex h-screen gap-4 p-3 md:p-4">
      <aside className="flex w-full max-w-[280px] shrink-0 flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#6b7c93]">{CLINIC_NAME}</p>
            <p className="text-sm font-medium text-cyan-300">{user.name ?? user.email}</p>
          </div>
          <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-400">Secure</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {menuItems
            .filter((item) => !("hidden" in item && item.hidden))
            .map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              className={cn(
                "!justify-start gap-3 border hover:border-[#2d3f57] hover:bg-[#151d29]",
                ((item.id === "schedule" && mainView === "schedule") ||
                  (item.id === "lists" && mainView === "lists") ||
                  (item.id === "messages" && mainView === "messages") ||
                  (item.id === "reminders" && mainView === "reminders"))
                  ? "border-cyan-500/40 bg-cyan-500/10"
                  : "border-transparent"
              )}
              disabled={"disabled" in item && item.disabled}
              onClick={() => handleNavClick(item.id)}
            >
              <item.icon size={18} className={item.color} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === "messages" && unreadMessages > 0 && (
                <span className="rounded-full bg-cyan-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {unreadMessages > 9 ? "9+" : unreadMessages}
                </span>
              )}
              {item.id === "reminders" && pendingReminders > 0 && (
                <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {pendingReminders > 9 ? "9+" : pendingReminders}
                </span>
              )}
            </Button>
          ))}
          {user.role === "ADMIN" && (
            <Button variant="ghost" className="!justify-start gap-3" onClick={() => handleNavClick("audit")}>
              <ClipboardList size={18} className="text-cyan-400" /> Audit Log
            </Button>
          )}
        </nav>

        <Button variant="ghost" className="!justify-start gap-3 text-[#8b9cb3]" onClick={logout}>
          <LogOut size={18} /> Logout
        </Button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col rounded-2xl border border-[#243044] bg-[#101722]/80">
        <header className="border-b border-[#243044] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {mainView === "schedule" ? (
                <>
                  <Calendar className="text-amber-400" size={20} />
                  <h1 className="text-lg font-semibold">Clinic Schedule</h1>
                </>
              ) : mainView === "lists" ? (
                <>
                  <List className="text-fuchsia-400" size={20} />
                  <h1 className="text-lg font-semibold">Patient Lists</h1>
                </>
              ) : mainView === "messages" ? (
                <>
                  <MessageSquare className="text-sky-300" size={20} />
                  <h1 className="text-lg font-semibold">Messages</h1>
                </>
              ) : mainView === "reminders" ? (
                <>
                  <Bell className="text-orange-300" size={20} />
                  <h1 className="text-lg font-semibold">Reminders</h1>
                </>
              ) : (
                <>
                  <Stethoscope className="text-cyan-400" size={20} />
                  <h1 className="text-lg font-semibold">
                    {current ? formatDisplayName(current) : "Select a patient"}
                  </h1>
                </>
              )}
            </div>
            {(mainView === "schedule" ||
              mainView === "lists" ||
              mainView === "messages" ||
              mainView === "reminders") &&
              current && (
              <Button className="!py-2 !text-xs" onClick={() => setMainView("chart")}>
                Open {formatDisplayName(current)}&apos;s Chart
              </Button>
            )}
            {mainView === "chart" && current && (
              <div className="flex flex-wrap gap-2">
                <Button
                  className="!py-2 !text-xs"
                  onClick={() => setModal("reminders")}
                >
                  <Bell size={14} /> Reminders
                </Button>
                {!isChartReadOnly && (
                  <>
                <Button
                  variant="primary"
                  className="!py-2 !text-xs"
                  onClick={async () => {
                    try {
                      notify("AI organizing chart...", "info");
                      await api(`/api/patients/${current.id}/ai/organize`, { method: "POST" });
                      const data = await api<{ patient: Patient }>(`/api/patients/${current.id}`);
                      setCurrent(data.patient);
                      notify("Chart organized", "success");
                    } catch (e) {
                      notify(e instanceof Error ? e.message : "AI failed", "error");
                    }
                  }}
                >
                  <Bot size={14} /> AI Organize
                </Button>
                <Button
                  className="!py-2 !text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(chartCopyText);
                    notify("Copied chart", "success");
                  }}
                >
                  Copy All
                </Button>
                  </>
                )}
              </div>
            )}
          </div>
          {mainView === "chart" && current && isChartReadOnly && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              <span>
                This chart is <strong>{current.status === "DECEASED" ? "deceased" : "archived"}</strong> — read-only. Data is retained for compliance.
              </span>
              {user.role === "ADMIN" && (
                <Button className="!py-1.5 !text-xs" variant="primary" onClick={restorePatient}>
                  Restore to Active
                </Button>
              )}
            </div>
          )}
          {mainView === "chart" && current && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8b9cb3]">
              {current.mrn && <span>MRN: <span className="text-cyan-200">{current.mrn}</span></span>}
              {current.dateOfBirth && (
                <span>
                  DOB: <span className="text-cyan-200">{formatDateOnly(current.dateOfBirth)}</span>
                  {calculateAge(current.dateOfBirth) !== null && (
                    <span> ({calculateAge(current.dateOfBirth)}y)</span>
                  )}
                </span>
              )}
              {current.sexAtBirth && (
                <span>Sex: <span className="text-cyan-200">{formatSexAtBirth(current.sexAtBirth)}</span></span>
              )}
              {current.phone && <span>Phone: <span className="text-cyan-200">{current.phone}</span></span>}
              {current.allergies && (
                <span className="text-amber-300/90">Allergies: {current.allergies}</span>
              )}
            </div>
          )}
          {mainView === "chart" && current && (
            <div className="mt-3 flex gap-1 overflow-x-auto border-t border-[#243044] pt-3">
              {CHART_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setChartTab(tab.id)}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    chartTab === tab.id
                      ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40"
                      : "text-[#8b9cb3] hover:bg-[#1a2330] hover:text-white"
                  )}
                >
                  {tab.shortLabel}
                </button>
              ))}
            </div>
          )}
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          {mainView === "schedule" ? (
            <SchedulePanel patients={patients} onSelectPatient={selectPatient} />
          ) : mainView === "lists" ? (
            <ListsPanel patients={patients} onSelectPatient={selectPatient} />
          ) : mainView === "messages" ? (
            <MessagingPanel
              user={user}
              patients={patients}
              onSelectPatient={selectPatient}
              onUnreadChange={setUnreadMessages}
            />
          ) : mainView === "reminders" ? (
            <RemindersPanel
              patients={patients}
              refreshKey={remindersRefreshKey}
              onMutate={bumpReminders}
              onSelectPatient={selectPatient}
              canEdit={user.role !== "READONLY"}
            />
          ) : !current ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[#6b7c93]">
              Select a patient to view chart
            </div>
          ) : (
            <>
              <div className={cn("flex min-h-0 flex-1 flex-col", chartTab !== "encounters" && "hidden")}>
                <ChartEncountersPanel
                  patientId={current.id}
                  chartInsertData={chartInsertData}
                  isReadOnly={!!isChartReadOnly}
                  canRemoveRecords={canRemoveRecords}
                  onPatientDataChange={refreshNotes}
                />
              </div>
              <div className={cn("flex min-h-0 flex-1 flex-col", chartTab !== "notes" && "hidden")}>
                <ChartNotesPanel
                  isReadOnly={!!isChartReadOnly}
                  patientId={current.id}
                  notes={notes}
                  chartInsertData={chartInsertData}
                  onRefresh={refreshNotes}
                />
              </div>
              {MEDICAL_SECTIONS.map((section) => (
                <div
                  key={section.key}
                  className={cn("flex min-h-0 flex-1 flex-col", chartTab !== section.key && "hidden")}
                >
                  {section.key === "diagnosis" ? (
                    <ChartDiagnosisPanel
                      value={String(current.diagnosis ?? "")}
                      isActive={chartTab === section.key}
                      isReadOnly={!!isChartReadOnly}
                      onSave={saveSection}
                      canRemoveRecords={canRemoveRecords}
                    />
                  ) : (
                    <ChartSectionPanel
                      sectionKey={section.key}
                      value={String(current[section.key as keyof Patient] ?? "")}
                      isActive={chartTab === section.key}
                      isReadOnly={!!isChartReadOnly}
                      onSave={saveSection}
                      canRemoveRecords={canRemoveRecords}
                    />
                  )}
                </div>
              ))}
              <div className={cn("flex min-h-0 flex-1 flex-col", chartTab !== "documents" && "hidden")}>
                <ChartDocumentsPanel
                  patientId={current.id}
                  isReadOnly={!!isChartReadOnly}
                  canRemoveRecords={canRemoveRecords}
                  showEncounterBadge
                />
              </div>
            </>
          )}
        </div>
      </main>

      <PatientsModal
        open={modal === "patients"}
        onClose={() => setModal(null)}
        patients={patients}
        search={search}
        setSearch={setSearch}
        onSearch={() => loadPatients(search, includeArchived)}
        currentId={current?.id}
        onSelect={selectPatient}
        isAdmin={user.role === "ADMIN"}
        includeArchived={includeArchived}
        onToggleArchived={(v) => {
          setIncludeArchived(v);
          loadPatients(search, v);
        }}
      />

      <AddPatientModal
        open={modal === "add"}
        onClose={() => setModal(null)}
        onSubmit={addPatient}
      />

      <ArchivePatientModal
        open={modal === "archive"}
        onClose={() => setModal(null)}
        patientName={current ? formatDisplayName(current) : ""}
        onSubmit={archivePatient}
      />

      {current?.mrn && (
        <HardDeletePatientModal
          open={modal === "hardDelete"}
          onClose={() => setModal(null)}
          patientName={current.name}
          mrn={current.mrn}
          onSubmit={hardDeletePatient}
        />
      )}

      {current && (
        <AIModal
            open={modal === "ai"}
            onClose={() => setModal(null)}
            patientId={current.id}
            patientName={current.name}
        />
      )}

      {current && (
        <PatientRemindersModal
          open={modal === "reminders"}
          onClose={() => setModal(null)}
          patient={current}
          patients={patients}
          refreshKey={remindersRefreshKey}
          onMutate={bumpReminders}
          canEdit={user.role !== "READONLY" && !isChartReadOnly}
        />
      )}

      <AuditModal open={modal === "audit"} onClose={() => setModal(null)} />

      <Toast message={toast.message} type={toast.type} />
    </div>
  );
}

function PatientsModal({
  open,
  onClose,
  patients,
  search,
  setSearch,
  onSearch,
  currentId,
  onSelect,
  isAdmin,
  includeArchived,
  onToggleArchived,
}: {
  open: boolean;
  onClose: () => void;
  patients: Patient[];
  search: string;
  setSearch: (v: string) => void;
  onSearch: () => void;
  currentId?: string;
  onSelect: (p: Patient) => void;
  isAdmin?: boolean;
  includeArchived?: boolean;
  onToggleArchived?: (v: boolean) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Patient List" wide>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Search patients..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button onClick={onSearch}><Search size={16} /></Button>
        {isAdmin && onToggleArchived && (
          <label className="ml-auto flex items-center gap-2 text-xs text-[#8b9cb3]">
            <input
              type="checkbox"
              checked={!!includeArchived}
              onChange={(e) => onToggleArchived(e.target.checked)}
              className="rounded border-[#2d3f57]"
            />
            Show archived
          </label>
        )}
      </div>
      <p className="mb-3 text-xs text-[#6b7c93]">{patients.length} patients</p>
      <div className="space-y-2">
        {patients.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className={cn(
              "w-full rounded-xl border px-4 py-3 text-left transition hover:bg-[#1a2330]",
              p.id === currentId ? "border-cyan-500/50 bg-cyan-500/5" : "border-[#243044] bg-[#0f1520]"
            )}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-cyan-200">{formatDisplayName(p)}</span>
              {p.status && p.status !== "ACTIVE" && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase text-amber-300">
                  {p.status === "DECEASED" ? "Deceased" : "Archived"}
                </span>
              )}
            </div>
            <div className="text-xs text-[#6b7c93]">
              {[p.mrn, p.dateOfBirth ? `DOB ${formatDateOnly(p.dateOfBirth)}` : null, p.phone]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="text-xs text-[#6b7c93]">Updated {formatDate(p.updatedAt)}</div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function ChartNotesPanel({
  notes,
  patientId,
  chartInsertData,
  isReadOnly,
  onRefresh,
}: {
  patientId: string;
  notes: Note[];
  chartInsertData: PatientChartInsertSnapshot;
  isReadOnly: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [activeNote, setActiveNote] = useState<Note | null>(null);

  if (activeNote) {
    return (
      <StructuredNoteEditor
        patientId={patientId}
        note={{
          id: activeNote.id,
          type: activeNote.type,
          status: activeNote.status ?? "DRAFT",
          date: activeNote.date,
          content: activeNote.content,
          signedAt: activeNote.signedAt,
          encounterId: activeNote.encounterId,
        }}
        chartInsertData={chartInsertData}
        isReadOnly={isReadOnly}
        onBack={() => setActiveNote(null)}
        onSaved={async () => {
          await onRefresh();
          const data = await api<{ notes: Note[] }>(`/api/patients/${patientId}/notes`);
          const updated = data.notes.find((n) => n.id === activeNote.id);
          if (updated) setActiveNote(updated);
        }}
        onSigned={async () => {
          await onRefresh();
          const data = await api<{ notes: Note[] }>(`/api/patients/${patientId}/notes`);
          const updated = data.notes.find((n) => n.id === activeNote.id);
          if (updated) setActiveNote(updated);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="space-y-2">
        {notes.length === 0 && <p className="text-sm text-[#6b7c93]">No clinical notes yet.</p>}
        {notes.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setActiveNote(n)}
            className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-[#243044] bg-[#0f1520] px-4 py-3 text-left transition hover:border-cyan-500/40 hover:bg-[#1a2330]"
          >
            <span className="text-sm font-medium text-cyan-200">{getNoteTypeLabel(n.type)}</span>
            <span className="text-sm text-[#8b9cb3]">{formatDate(n.date)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChartSectionPanel({
  sectionKey,
  value,
  isActive,
  isReadOnly,
  onSave,
  canRemoveRecords,
}: {
  sectionKey: MedicalSectionKey;
  value: string;
  isActive: boolean;
  isReadOnly: boolean;
  onSave: (v: string, reason?: string, silent?: boolean) => Promise<void>;
  canRemoveRecords?: boolean;
}) {
  const [content, setContent] = useState(value);
  const [showClearReason, setShowClearReason] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savedValueRef = useRef(value);
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    setDirty(false);
    savedValueRef.current = value;
    setContent(value);
    setShowClearReason(false);
  }, [value, sectionKey]);

  const persist = useCallback(
    async (next: string, silent = true) => {
      if (isReadOnly) return;
      if (!next.trim() && savedValueRef.current.trim()) return;
      if (next === savedValueRef.current) return;
      setSaving(true);
      try {
        await onSave(next, undefined, silent);
        savedValueRef.current = next;
        setDirty(false);
      } finally {
        setSaving(false);
      }
    },
    [isReadOnly, onSave]
  );

  const { debounced: debouncedPersist, flush: flushPersist } = useDebouncedCallback(persist, 1000);

  useEffect(() => {
    if (wasActiveRef.current && !isActive) {
      flushPersist();
    }
    wasActiveRef.current = isActive;
  }, [isActive, flushPersist]);

  const section = MEDICAL_SECTIONS.find((s) => s.key === sectionKey);
  const label = section?.label ?? sectionKey;
  const isClearing = content.trim() === "" && savedValueRef.current.trim() !== "";

  async function handleSave() {
    if (isClearing) {
      setShowClearReason(true);
      return;
    }
    await persist(content, false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-cyan-300">
          {section?.icon} {label}
        </h2>
        {!isReadOnly && <AutoSaveStatus saving={saving} dirty={dirty} />}
      </div>
      <Textarea
        className="min-h-[400px] flex-1"
        value={content}
        onChange={(e) => {
          const next = e.target.value;
          setDirty(true);
          setContent(next);
          debouncedPersist(next);
        }}
        disabled={isReadOnly}
        placeholder={isReadOnly ? "Read-only" : `Enter ${label.toLowerCase()}...`}
      />
      {!isReadOnly && (
        <div className="mt-4 flex justify-between gap-2">
          {canRemoveRecords && savedValueRef.current.trim() && (
            <Button
              variant="danger"
              className="!text-xs"
              onClick={() => {
                setContent("");
                setShowClearReason(true);
              }}
            >
              Clear Section
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="success" onClick={handleSave}>
              {isClearing ? "Clear Section" : "Save"}
            </Button>
          </div>
        </div>
      )}
      <DeleteReasonModal
        open={showClearReason}
        onClose={() => setShowClearReason(false)}
        title={`Clear ${label}`}
        description="Removing clinical section content requires a documented reason. This action is audit-logged."
        confirmLabel="Clear Section"
        onConfirm={async (reason) => {
          await onSave("", reason);
          setShowClearReason(false);
        }}
      />
    </div>
  );
}

function ChartDocumentsPanel({
  patientId,
  isReadOnly,
  canRemoveRecords,
  showEncounterBadge,
}: {
  patientId: string;
  isReadOnly: boolean;
  canRemoveRecords?: boolean;
  showEncounterBadge?: boolean;
}) {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ documents: DocumentItem[] }>(`/api/patients/${patientId}/documents`);
    setDocs(data.documents);
  }, [patientId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  async function upload() {
    if (!file || !name.trim()) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name.trim());
    await fetch(`/api/patients/${patientId}/documents/upload`, { method: "POST", body: fd, credentials: "include" });
    setName("");
    setFile(null);
    await load();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <h2 className="mb-1 text-sm font-semibold text-cyan-300">
        <Upload size={16} className="mr-1 inline" /> Documents
      </h2>
      {showEncounterBadge && (
        <p className="mb-3 text-xs text-[#6b7c93]">
          All documents across encounters. Attach files to a specific encounter from the Encounters tab.
        </p>
      )}
      {!isReadOnly && (
        <div className="mb-4 grid gap-2 rounded-xl border border-[#243044] bg-[#0f1520] p-3 md:grid-cols-3">
          <Input placeholder="Document name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button variant="success" onClick={upload}>
            Upload
          </Button>
        </div>
      )}
      <div className="space-y-2">
        {docs.length === 0 && <p className="text-sm text-[#6b7c93]">No documents uploaded.</p>}
        {docs.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between rounded-xl border border-[#243044] bg-[#0f1520] px-4 py-3"
          >
            <div>
              <div className="font-medium text-cyan-200">{d.name}</div>
              <div className="text-xs text-[#6b7c93]">
                {d.fileName} · {(d.fileSize / 1024).toFixed(1)} KB
              </div>
              {showEncounterBadge && d.encounter && (
                <div className="mt-1 text-[10px] text-violet-300">
                  {formatEncounterLabel(d.encounter.visitCategory, d.encounter.modality)} · {formatDateOnly(d.encounter.date)}
                </div>
              )}
              {showEncounterBadge && !d.encounter && (
                <div className="mt-1 text-[10px] text-[#8b9cb3]">No encounter</div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                className="!text-xs"
                onClick={() => window.open(`/api/patients/${patientId}/documents/${d.id}`, "_blank")}
              >
                Open
              </Button>
              {!isReadOnly && canRemoveRecords && (
                <Button variant="danger" className="!text-xs" onClick={() => setDeleteDocId(d.id)}>
                  Delete
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <DeleteReasonModal
        open={!!deleteDocId}
        onClose={() => setDeleteDocId(null)}
        title="Delete Document"
        description="Deleting a document is permanent and audit-logged. Provide a documented reason."
        confirmLabel="Delete Document"
        onConfirm={async (reason) => {
          if (!deleteDocId) return;
          await api(`/api/patients/${patientId}/documents/${deleteDocId}`, {
            method: "DELETE",
            json: { reason },
          });
          setDeleteDocId(null);
          await load();
        }}
      />
    </div>
  );
}

function AIModal({ open, onClose, patientId, patientName }: { open: boolean; onClose: () => void; patientId: string; patientName: string }) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      api<{ messages: { role: string; content: string }[] }>(`/api/patients/${patientId}/ai`)
        .then((d) => setMessages(d.messages))
        .catch(() => setMessages([]));
    }
  }, [open, patientId]);

  async function send() {
    if (!input.trim()) return;
    const q = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await api<{ response: string }>(`/api/patients/${patientId}/ai`, {
        method: "POST",
        json: { message: q },
      });
      setMessages((m) => [...m, { role: "assistant", content: res.response }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : "failed"}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`AI Assistant — ${patientName}`} wide>
      <div className="mb-3 max-h-[50vh] space-y-3 overflow-y-auto rounded-xl border border-[#243044] bg-[#0b1018] p-3">
        {messages.length === 0 && (
          <p className="text-sm text-[#8b9cb3]">Ask about this patient&apos;s chart. All queries are audit-logged. Use Azure OpenAI with BAA in production.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("rounded-lg px-3 py-2 text-sm whitespace-pre-wrap", m.role === "user" ? "ml-8 bg-sky-900/50" : "mr-8 bg-[#1a2330]")}>{m.content}</div>
        ))}
        {loading && <p className="text-center text-sm text-cyan-400">Thinking...</p>}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Ask about this patient..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <Button variant="primary" onClick={send}>Send</Button>
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="danger" className="!text-xs" onClick={async () => {
          await api(`/api/patients/${patientId}/ai`, { method: "DELETE" });
          setMessages([]);
        }}>Clear History</Button>
      </div>
    </Modal>
  );
}

function SchedulePanel({
  patients,
  onSelectPatient,
}: {
  patients: Patient[];
  onSelectPatient: (p: Patient) => void;
}) {
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [scheduled, setScheduled] = useState<{ id: string; name: string }[]>([]);
  const [patientId, setPatientId] = useState("");

  const load = useCallback(async () => {
    const data = await api<{ patients: { id: string; name: string }[] }>(`/api/schedule?date=${date}`);
    setScheduled(data.patients);
  }, [date]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-[#6b7c93]">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-[200px]" />
        </div>
        <p className="text-sm text-[#8b9cb3]">
          {scheduled.length} patient{scheduled.length === 1 ? "" : "s"} scheduled
        </p>
      </div>
      <div className="mb-4 flex max-w-xl gap-2">
        <select
          className="flex-1 rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2 text-sm"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
        >
          <option value="">Select patient...</option>
          {patients
            .filter((p) => !scheduled.some((s) => s.id === p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {formatDisplayName(p)}
              </option>
            ))}
        </select>
        <Button
          variant="success"
          onClick={async () => {
            if (!patientId) return;
            await api("/api/schedule", { method: "POST", json: { date, patientId } });
            setPatientId("");
            await load();
          }}
        >
          Add
        </Button>
      </div>
      <div className="space-y-2">
        {scheduled.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#243044] px-4 py-8 text-center text-sm text-[#6b7c93]">
            No patients scheduled for this date
          </p>
        ) : (
          scheduled.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-[#243044] bg-[#0f1520] px-4 py-3"
            >
              <button
                type="button"
                className="text-left font-medium text-cyan-300 hover:underline"
                onClick={() => {
                  const patient = patients.find((x) => x.id === p.id);
                  if (patient) onSelectPatient(patient);
                }}
              >
                {p.name}
              </button>
              <Button
                variant="danger"
                className="!text-xs"
                onClick={async () => {
                  await api("/api/schedule", { method: "DELETE", json: { date, patientId: p.id } });
                  await load();
                }}
              >
                Remove
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ListsPanel({
  patients,
  onSelectPatient,
}: {
  patients: Patient[];
  onSelectPatient: (p: Patient) => void;
}) {
  const [lists, setLists] = useState<PatientList[]>([]);
  const [name, setName] = useState("");
  const [detail, setDetail] = useState<PatientList | null>(null);
  const [patientId, setPatientId] = useState("");

  const load = useCallback(async () => {
    const data = await api<{ lists: PatientList[] }>("/api/lists");
    setLists(data.lists);
  }, []);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  if (detail) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mb-4 flex items-center gap-3">
          <Button onClick={() => setDetail(null)}>← Back</Button>
          <h2 className="text-base font-medium text-cyan-200">{detail.name}</h2>
          <span className="text-xs text-[#6b7c93]">{detail.patients.length} patients</span>
        </div>
        <div className="mb-4 flex max-w-xl gap-2">
          <select
            className="flex-1 rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2 text-sm"
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
          >
            <option value="">Add patient...</option>
            {patients
              .filter((p) => !detail.patients.some((dp) => dp.id === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {formatDisplayName(p)}
                </option>
              ))}
          </select>
          <Button
            variant="success"
            onClick={async () => {
              if (!patientId) return;
              await api(`/api/lists/${detail.id}`, { method: "POST", json: { patientId } });
              const data = await api<{ lists: PatientList[] }>("/api/lists");
              setDetail(data.lists.find((l) => l.id === detail.id) ?? null);
              setPatientId("");
            }}
          >
            Add
          </Button>
        </div>
        <div className="space-y-2">
          {detail.patients.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#243044] px-4 py-8 text-center text-sm text-[#6b7c93]">
              No patients in this list yet
            </p>
          ) : (
            detail.patients.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-[#243044] bg-[#0f1520] px-4 py-3"
              >
                <button
                  type="button"
                  className="text-left font-medium text-cyan-300 hover:underline"
                  onClick={() => {
                    const pt = patients.find((x) => x.id === p.id);
                    if (pt) onSelectPatient(pt);
                  }}
                >
                  {p.name}
                </button>
                <Button
                  variant="danger"
                  className="!text-xs"
                  onClick={async () => {
                    await api(`/api/lists/${detail.id}/patients/${p.id}`, { method: "DELETE" });
                    const data = await api<{ lists: PatientList[] }>("/api/lists");
                    setDetail(data.lists.find((l) => l.id === detail.id) ?? null);
                  }}
                >
                  Remove
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mb-4 flex max-w-xl gap-2">
        <Input placeholder="New list name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          variant="success"
          onClick={async () => {
            if (!name.trim()) return;
            await api("/api/lists", { method: "POST", json: { name } });
            setName("");
            await load();
          }}
        >
          Create
        </Button>
      </div>
      <div className="space-y-2">
        {lists.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#243044] px-4 py-8 text-center text-sm text-[#6b7c93]">
            No lists yet — create one above
          </p>
        ) : (
          lists.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setDetail(l)}
              className="flex w-full items-center justify-between rounded-xl border border-[#243044] bg-[#0f1520] px-4 py-3 text-left transition hover:bg-[#1a2330]"
            >
              <div>
                <div className="font-medium text-cyan-200">{l.name}</div>
                <div className="text-xs text-[#6b7c93]">{l.patients.length} patients</div>
              </div>
              <span className="text-[#6b7c93]">→</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function AuditModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [logs, setLogs] = useState<Array<{ id: string; action: string; resource: string; createdAt: string; user?: { email: string } }>>([]);

  useEffect(() => {
    if (open) {
      api<{ logs: typeof logs }>("/api/audit?limit=100").then((d) => setLogs(d.logs)).catch(() => undefined);
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Audit Log (Admin)" wide>
      <div className="space-y-2 text-xs">
        {logs.map((l) => (
          <div key={l.id} className="grid grid-cols-4 gap-2 rounded-lg border border-[#243044] bg-[#0f1520] px-3 py-2">
            <span className="text-[#8b9cb3]">{formatDate(l.createdAt)}</span>
            <span className="text-cyan-300">{l.action}</span>
            <span>{l.resource}</span>
            <span className="truncate text-[#6b7c93]">{l.user?.email ?? "—"}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
