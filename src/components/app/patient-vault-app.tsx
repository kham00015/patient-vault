"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/roles";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { Toast } from "@/components/ui/toast";
import { MEDICAL_SECTIONS, type MedicalSectionKey } from "@/lib/medical-sections";
import { getDocumentSectionLabel, isChartUploadSection, isTextReportDocument, isTextReportSection, type TextReportSectionKey } from "@/lib/document-sections";
import {
  getNoteTypeLabel,
  NOTE_TYPES,
  type NoteType,
} from "@/lib/notes";
import { getNoteAuthorLabel, getNoteStatusLabel } from "@/lib/note-authors";
import { flattenNoteForDisplay, parseNoteContent } from "@/lib/note-content";
import { AddPatientModal } from "@/components/app/add-patient-modal";
import { ArchivePatientModal, HardDeletePatientModal } from "@/components/app/archive-patient-modal";
import { StructuredNoteEditor } from "@/components/app/structured-note-editor";
import { ChartEncountersPanel } from "@/components/app/chart-encounters-panel";
import { ChartDiagnosisPanel } from "@/components/app/chart-diagnosis-panel";
import { MessagingPanel } from "@/components/app/messaging-panel";
import { PatientRemindersModal } from "@/components/app/patient-reminders-modal";
import { PatientPersonalNoteModal } from "@/components/app/patient-personal-note-modal";
import { AiListenModal } from "@/components/app/ai-listen-modal";
import { RemindersPanel } from "@/components/app/reminders-panel";
import { UnsignedNotesPanel } from "@/components/app/unsigned-notes-panel";
import { ContactsPanel } from "@/components/app/contacts-panel";
import { SchedulePanel } from "@/components/app/schedule-panel";
import { OrdersPanel } from "@/components/app/orders-panel";
import { FullPageDocumentViewer } from "@/components/app/full-page-document-viewer";
import { SectionDocumentUploads } from "@/components/app/note-section-uploads";
import { SectionTextReports } from "@/components/app/section-text-reports";
import { TextReportDocumentEditor } from "@/components/app/text-report-document-editor";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { CLINIC_NAME } from "@/lib/branding";
import type { ChartNavigationIntent } from "@/lib/chart-navigation";
import {
  formatEncounterLabel,
  type VisitCategory,
} from "@/lib/encounters";
import { UsersAdminModal } from "@/components/app/users-admin-modal";
import {
  AccountSecurityModal,
  ChangePasswordModal,
} from "@/components/app/account-security-modal";
import { DeleteReasonModal } from "@/components/app/delete-reason-modal";
import { IdleSessionGuard } from "@/components/app/idle-session-guard";
import { SendFaxModal } from "@/components/app/send-fax-modal";
import type { PatientChartInsertSnapshot } from "@/lib/note-chart-map";
import type { CreatePatientInput } from "@/lib/patient-registration";
import type { ArchivePatientInput } from "@/lib/patient-lifecycle";
import {
  calculateAge,
  formatDisplayName,
  formatSexAtBirth,
} from "@/lib/patient-registration";
import {
  clampNotesListWidth,
  loadNotesListWidth,
  notesListFontScale,
  NOTES_LIST_WIDTH_DEFAULT,
  NOTES_LIST_WIDTH_MAX,
  NOTES_LIST_WIDTH_MIN,
  persistNotesListWidth,
} from "@/lib/notes-list-layout";
import { cn, formatDate, formatDateOnly, toDateInputValue } from "@/lib/utils";
import { AutoSaveStatus, useDebouncedCallback } from "@/lib/use-debounced-callback";
import {
  Archive,
  ArrowLeft,
  Bot,
  Calendar,
  ClipboardList,
  FileText,
  FileWarning,
  List,
  LogOut,
  MessageSquare,
  Bell,
  BookUser,
  Mic,
  Plus,
  Search,
  Stethoscope,
  Trash2,
  Shield,
  Upload,
  User,
  UserCog,
  Users,
  GripVertical,
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
  createdAt?: string | null;
  revisionCount?: number | null;
  lastRevisedAt?: string | null;
  lastRevisedByName?: string | null;
  encounterId?: string | null;
  encounter?: { id: string; visitCategory: string; modality: string; date: string } | null;
  authorName?: string | null;
  signedByName?: string | null;
  createdBy?: { id: string; name: string | null; email: string } | null;
  signedBy?: { id: string; name: string | null; email: string } | null;
  lastRevisedBy?: { id: string; name: string | null; email: string } | null;
  revisions?: Array<{
    version: number;
    revisedAt: string;
    revisedByName?: string | null;
  }>;
};
type PatientList = { id: string; name: string; patients: { id: string; name: string }[] };
type DocumentItem = {
  id: string;
  kind?: "upload" | "form" | "note" | "report";
  sourceId?: string;
  name: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  status?: string | null;
  noteType?: string | null;
  authorName?: string | null;
  encounterId?: string | null;
  noteId?: string | null;
  sectionKey?: string | null;
  encounter?: { id: string; visitCategory: string; modality: string; date: string } | null;
  canDelete?: boolean;
  canRename?: boolean;
  canFax?: boolean;
  openUrl?: string;
};

type ChartTab = "encounters" | "notes" | "orders" | "documents" | MedicalSectionKey;

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
      const authorLabel = getNoteAuthorLabel(note);
      const signLabel = ` [${getNoteStatusLabel(note)}]`;
      lines.push(
        `${formatDate(note.date)} · ${getNoteTypeLabel(note.type)} · ${authorLabel}${encounterLabel}${signLabel}:`,
        preview || "(empty)",
        ""
      );
    }
  }
  return lines.join("\n");
}

const CHART_TABS: { id: ChartTab; label: string; shortLabel: string }[] = [
  { id: "encounters", label: "Encounters", shortLabel: "Encounters" },
  { id: "documents", label: "Documents", shortLabel: "Documents" },
  { id: "notes", label: "Notes", shortLabel: "Notes" },
  ...MEDICAL_SECTIONS.flatMap((s) => [
    {
      id: s.key as ChartTab,
      label: s.label,
      shortLabel: s.label.split(" ")[0],
    },
    ...(s.key === "diagnosis"
      ? [{ id: "orders" as ChartTab, label: "Orders", shortLabel: "Orders" }]
      : []),
  ]),
];

/** v2 default: Documents sits directly under Encounters. */
const CHART_TAB_ORDER_KEY = "pv-chart-tab-order-v2";

function getDefaultChartTabOrder(): ChartTab[] {
  return CHART_TABS.map((t) => t.id);
}

function normalizeChartTabOrder(ids: string[]): ChartTab[] {
  const known = new Set(CHART_TABS.map((t) => t.id));
  const ordered = ids.filter((id): id is ChartTab => known.has(id as ChartTab));
  for (const tab of CHART_TABS) {
    if (!ordered.includes(tab.id)) ordered.push(tab.id);
  }
  return ordered;
}

function loadChartTabOrder(): ChartTab[] {
  if (typeof window === "undefined") return getDefaultChartTabOrder();
  try {
    const raw = window.localStorage.getItem(CHART_TAB_ORDER_KEY);
    if (!raw) return getDefaultChartTabOrder();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getDefaultChartTabOrder();
    return normalizeChartTabOrder(parsed.map(String));
  } catch {
    return getDefaultChartTabOrder();
  }
}

type MainView = "chart" | "schedule" | "lists" | "messages" | "reminders" | "contacts" | "unsignedNotes";

const MAIN_VIEW_LABELS: Record<MainView, string> = {
  chart: "Patient Chart",
  schedule: "Clinic Schedule",
  lists: "Patient Lists",
  messages: "Messages",
  reminders: "Reminders",
  contacts: "Contacts",
  unsignedNotes: "Notes to Sign",
};

type ModalType =
  | "patients"
  | "add"
  | "archive"
  | "hardDelete"
  | "upload"
  | "ai"
  | "audit"
  | "users"
  | "security"
  | "reminders"
  | "personalNote"
  | "aiListen"
  | null;

type SelectPatientOptions = {
  fromSchedule?: boolean;
  scheduleDate?: string;
  visitCategory?: VisitCategory;
  encounterId?: string;
  openNotesBranch?: boolean;
  openNote?: boolean;
};

export default function PatientVaultApp({
  user: initialUser,
  sessionTimeoutMinutes = 5,
}: {
  user: SessionUser;
  sessionTimeoutMinutes?: number;
}) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [mustChangePassword, setMustChangePassword] = useState(!!initialUser.mustChangePassword);
  const [chartNavigationIntent, setChartNavigationIntent] = useState<ChartNavigationIntent | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [current, setCurrent] = useState<Patient | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [modal, setModal] = useState<ModalType>(null);
  const [mainView, setMainView] = useState<MainView>("schedule");
  const [viewHistory, setViewHistory] = useState<MainView[]>([]);
  const mainViewRef = useRef<MainView>(mainView);
  mainViewRef.current = mainView;
  const [chartTab, setChartTab] = useState<ChartTab>("encounters");
  const [chartTabOrder, setChartTabOrder] = useState<ChartTab[]>(getDefaultChartTabOrder);
  const [draggingChartTab, setDraggingChartTab] = useState<ChartTab | null>(null);
  const [dragOverChartTab, setDragOverChartTab] = useState<ChartTab | null>(null);
  const chartTabDragMovedRef = useRef(false);
  const [toast, setToast] = useState({ message: "", type: "info" as "info" | "success" | "error" });
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [pendingReminders, setPendingReminders] = useState(0);
  const [remindersRefreshKey, setRemindersRefreshKey] = useState(0);
  const [unsignedNotesCount, setUnsignedNotesCount] = useState(0);
  const [unsignedNotesRefreshKey, setUnsignedNotesRefreshKey] = useState(0);

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

  const pushViewHistory = useCallback((from: MainView) => {
    setViewHistory((h) => (h[h.length - 1] === from ? h : [...h, from].slice(-20)));
  }, []);

  const goToView = useCallback(
    (view: MainView) => {
      const from = mainViewRef.current;
      if (from !== view) {
        pushViewHistory(from);
        setMainView(view);
      }
      setModal(null);
    },
    [pushViewHistory]
  );

  const goBack = useCallback(() => {
    setViewHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1]!;
      setMainView(prev);
      return h.slice(0, -1);
    });
  }, []);

  const selectPatient = useCallback(async (patient: Pick<Patient, "id">, options?: SelectPatientOptions) => {
    try {
      const data = await api<{ patient: Patient }>(`/api/patients/${patient.id}`);
      const notesData = await api<{ notes: Note[] }>(`/api/patients/${patient.id}/notes`);
      setCurrent(data.patient);
      setNotes(notesData.notes);
      setChartTab("encounters");
      if (mainViewRef.current !== "chart") {
        pushViewHistory(mainViewRef.current);
      }
      setMainView("chart");
      setModal(null);
      if (options?.fromSchedule && options.scheduleDate) {
        setChartNavigationIntent({
          fromSchedule: true,
          scheduleDate: options.scheduleDate,
          visitCategory: options.visitCategory,
          openNote: true,
        });
      } else if (options?.encounterId) {
        setChartNavigationIntent({
          encounterId: options.encounterId,
          openNotesBranch: options.openNotesBranch ?? true,
          openNote: options.openNote ?? false,
        });
      } else {
        setChartNavigationIntent(null);
      }
      notify(`Opened ${formatDisplayName(data.patient)}`, "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed to open patient chart", "error");
    }
  }, [pushViewHistory]);

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

  const refreshUnsignedNotesSummary = useCallback(async () => {
    if (user.role !== "ADMIN" && user.role !== "CLINICIAN") {
      setUnsignedNotesCount(0);
      return;
    }
    try {
      const data = await api<{ count: number }>("/api/alerts/unsigned-notes?summary=1");
      setUnsignedNotesCount(data.count);
    } catch {
      // non-critical
    }
  }, [user.role]);

  const bumpUnsignedNotes = useCallback(() => {
    setUnsignedNotesRefreshKey((k) => k + 1);
    refreshUnsignedNotesSummary().catch(() => undefined);
  }, [refreshUnsignedNotesSummary]);

  useEffect(() => {
    refreshUnsignedNotesSummary().catch(() => undefined);
  }, [refreshUnsignedNotesSummary]);

  useEffect(() => {
    setChartTabOrder(loadChartTabOrder());
  }, []);

  const orderedChartTabs = useMemo(() => {
    const byId = new Map(CHART_TABS.map((tab) => [tab.id, tab]));
    return chartTabOrder.map((id) => byId.get(id)).filter(Boolean) as typeof CHART_TABS;
  }, [chartTabOrder]);

  const reorderChartTab = useCallback((fromId: ChartTab, toId: ChartTab) => {
    if (fromId === toId) return;
    setChartTabOrder((prev) => {
      const next = [...prev];
      const fromIndex = next.indexOf(fromId);
      const toIndex = next.indexOf(toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, fromId);
      try {
        window.localStorage.setItem(CHART_TAB_ORDER_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const canRemoveRecords = user.role === "ADMIN" || user.role === "CLINICIAN";

  async function logout() {
    await api("/api/auth/login", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  const idleLogout = useCallback(async () => {
    await api("/api/auth/login", { method: "DELETE" });
    router.push("/login?reason=idle");
    router.refresh();
  }, [router]);

  async function addPatient(data: CreatePatientInput) {
    const result = await api<{ patient: Patient }>("/api/patients", {
      method: "POST",
      json: data,
    });
    await loadPatients();
    await selectPatient(result.patient);
    notify(`Patient registered — ${result.patient.mrn ?? "MRN assigned"}`, "success");
  }

  const isChartReadOnly = Boolean(current?.status && current.status !== "ACTIVE");

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
    if (!current || chartTab === "encounters" || chartTab === "notes" || chartTab === "orders" || chartTab === "documents") return;
    try {
      const data = await api<{ patient: Patient }>(`/api/patients/${current.id}`, {
        method: "PATCH",
        json: { [chartTab]: value, ...(reason ? { reason } : {}) },
      });
      setCurrent(data.patient);
      if (
        chartTab === "diagnosis" ||
        chartTab === "pmh" ||
        chartTab === "medications"
      ) {
        await refreshNotes();
      }
      if (!silent) notify(value.trim() ? "Saved" : "Section cleared", "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Save failed", "error");
    }
  }

  async function refreshNotes() {
    if (!current) return;
    const [notesData, patientData] = await Promise.all([
      api<{ notes: Note[] }>(`/api/patients/${current.id}/notes`),
      api<{ patient: Patient }>(`/api/patients/${current.id}`),
    ]);
    setNotes(notesData.notes);
    setCurrent(patientData.patient);
    refreshUnsignedNotesSummary().catch(() => undefined);
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
      diagnosis: current?.diagnosis,
      pft: current?.pft,
    }),
    [current?.pmh, current?.social, current?.medications, current?.labs, current?.imaging, current?.diagnosis, current?.pft]
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
    {
      id: "unsignedNotes",
      label: "Notes to Sign",
      icon: FileWarning,
      color: "text-amber-300",
      hidden: user.role !== "ADMIN" && user.role !== "CLINICIAN",
    },
    { id: "contacts", label: "Contacts", icon: BookUser, color: "text-lime-300" },
  ] as const;

  function handleNavClick(id: (typeof menuItems)[number]["id"] | "audit" | "users") {
    if (id === "schedule") {
      goToView("schedule");
      return;
    }
    if (id === "lists") {
      goToView("lists");
      return;
    }
    if (id === "messages") {
      goToView("messages");
      return;
    }
    if (id === "reminders") {
      goToView("reminders");
      return;
    }
    if (id === "unsignedNotes") {
      goToView("unsignedNotes");
      bumpUnsignedNotes();
      return;
    }
    if (id === "contacts") {
      goToView("contacts");
      return;
    }
    setModal(id as ModalType);
  }

  const previousView = viewHistory[viewHistory.length - 1];

  return (
    <>
    <IdleSessionGuard timeoutMinutes={sessionTimeoutMinutes} onIdleLogout={idleLogout} />
    <div className={cn("flex h-screen flex-col gap-3 p-3 md:p-4", mustChangePassword && "pointer-events-none opacity-40")}>
      <header className="flex shrink-0 items-center gap-3 rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)] px-3 py-2.5 md:px-4">
        <div className="min-w-0 shrink-0 pr-1">
          <p className="text-xs uppercase tracking-wider text-[var(--pv-muted)]">{CLINIC_NAME}</p>
          <p className="truncate text-base font-medium text-cyan-300">{user.name ?? user.email}</p>
        </div>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {menuItems
            .filter((item) => !("hidden" in item && item.hidden))
            .map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              title={item.label}
              className={cn(
                "!h-11 !shrink-0 !gap-2 !px-3 !py-2 !text-base border",
                ((item.id === "schedule" && mainView === "schedule") ||
                  (item.id === "lists" && mainView === "lists") ||
                  (item.id === "messages" && mainView === "messages") ||
                  (item.id === "reminders" && mainView === "reminders") ||
                  (item.id === "unsignedNotes" && mainView === "unsignedNotes") ||
                  (item.id === "contacts" && mainView === "contacts"))
                  ? "border-cyan-500/40 bg-cyan-500/10"
                  : "border-transparent hover:border-[var(--pv-border-strong)] hover:bg-[var(--pv-hover)]"
              )}
              disabled={Boolean("disabled" in item && item.disabled)}
              onClick={() => handleNavClick(item.id)}
            >
              <item.icon size={18} className={item.color} />
              <span className="whitespace-nowrap">{item.label}</span>
              {item.id === "messages" && unreadMessages > 0 && (
                <span className="rounded-full bg-cyan-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  {unreadMessages > 9 ? "9+" : unreadMessages}
                </span>
              )}
              {item.id === "reminders" && pendingReminders > 0 && (
                <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  {pendingReminders > 9 ? "9+" : pendingReminders}
                </span>
              )}
              {item.id === "unsignedNotes" && unsignedNotesCount > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  {unsignedNotesCount > 9 ? "9+" : unsignedNotesCount}
                </span>
              )}
            </Button>
          ))}
          {user.role === "ADMIN" && (
            <>
              <Button
                variant="ghost"
                className="!h-11 !shrink-0 !gap-2 !px-3 !py-2 !text-base border border-transparent hover:border-[var(--pv-border-strong)] hover:bg-[var(--pv-hover)]"
                onClick={() => handleNavClick("users")}
              >
                <UserCog size={18} className="text-cyan-400" /> Users
              </Button>
              <Button
                variant="ghost"
                className="!h-11 !shrink-0 !gap-2 !px-3 !py-2 !text-base border border-transparent hover:border-[var(--pv-border-strong)] hover:bg-[var(--pv-hover)]"
                onClick={() => handleNavClick("audit")}
              >
                <ClipboardList size={18} className="text-cyan-400" /> Audit Log
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            className="!h-11 !shrink-0 !gap-2 !px-3 !py-2 !text-base border border-transparent hover:border-[var(--pv-border-strong)] hover:bg-[var(--pv-hover)]"
            onClick={() => setModal("security")}
          >
            <Shield size={18} className="text-violet-400" /> Account security
          </Button>
        </nav>

        <div className="flex shrink-0 items-center gap-1 border-l border-[var(--pv-border)] pl-3 sm:gap-2">
          <span className="hidden rounded-full bg-emerald-500/15 px-2 py-1 text-xs text-emerald-400 sm:inline">
            Secure
          </span>
          <ThemeToggle />
          <Button
            variant="ghost"
            className="!h-11 !gap-2 !px-3 !py-2 !text-base text-[var(--pv-muted-2)]"
            onClick={logout}
          >
            <LogOut size={18} /> Logout
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-surface)]">
        <header className="border-b border-[var(--pv-border)] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {previousView && (
                <Button
                  variant="ghost"
                  className="!h-9 !gap-1.5 !px-2 !py-1.5 !text-sm text-[var(--pv-muted-2)] hover:text-[var(--pv-text)]"
                  title={`Back to ${MAIN_VIEW_LABELS[previousView]}`}
                  onClick={goBack}
                >
                  <ArrowLeft size={18} />
                  <span className="hidden sm:inline">Back</span>
                </Button>
              )}
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
              ) : mainView === "unsignedNotes" ? (
                <>
                  <FileWarning className="text-amber-300" size={20} />
                  <h1 className="text-lg font-semibold">Notes to Sign</h1>
                </>
              ) : mainView === "contacts" ? (
                <>
                  <BookUser className="text-lime-300" size={20} />
                  <h1 className="text-lg font-semibold">Contacts</h1>
                </>
              ) : (
                <>
                  <Stethoscope className="text-cyan-400" size={20} />
                  {current ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        title="Open my private notes for this patient"
                        className="text-left text-lg font-semibold text-[var(--pv-fg)] hover:text-cyan-300 hover:underline"
                        onClick={() => setModal("personalNote")}
                      >
                        {formatDisplayName(current)}
                      </button>
                      {!isChartReadOnly && user.role !== "READONLY" && (
                        <Button
                          type="button"
                          variant="primary"
                          className="!py-1.5 !text-xs"
                          title="Listen with Amazon Transcribe Medical and draft HPI"
                          onClick={() => setModal("aiListen")}
                        >
                          <Mic size={14} /> AI Listen
                        </Button>
                      )}
                    </div>
                  ) : (
                    <h1 className="text-lg font-semibold">Select a patient</h1>
                  )}
                </>
              )}
            </div>
            {(mainView === "schedule" ||
              mainView === "lists" ||
              mainView === "messages" ||
              mainView === "reminders" ||
              mainView === "unsignedNotes" ||
              mainView === "contacts") &&
              current && (
              <Button className="!py-2 !text-xs" onClick={() => goToView("chart")}>
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
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--pv-muted-2)]">
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
        </header>

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {mainView === "chart" && current && (
            <aside className="flex w-[200px] shrink-0 flex-col border-r border-[var(--pv-border)] bg-[var(--pv-panel)]">
              <div className="border-b border-[var(--pv-border)] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
                  Chart sections
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--pv-muted)] opacity-80">Drag to reorder</p>
              </div>
              <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
                {orderedChartTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      chartTabDragMovedRef.current = false;
                      setDraggingChartTab(tab.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", tab.id);
                    }}
                    onDrag={() => {
                      chartTabDragMovedRef.current = true;
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverChartTab !== tab.id) setDragOverChartTab(tab.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverChartTab === tab.id) setDragOverChartTab(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromId = (e.dataTransfer.getData("text/plain") || draggingChartTab) as ChartTab | null;
                      if (fromId) reorderChartTab(fromId, tab.id);
                      setDraggingChartTab(null);
                      setDragOverChartTab(null);
                    }}
                    onDragEnd={() => {
                      setDraggingChartTab(null);
                      setDragOverChartTab(null);
                    }}
                    onClick={() => {
                      if (chartTabDragMovedRef.current) {
                        chartTabDragMovedRef.current = false;
                        return;
                      }
                      setChartTab(tab.id);
                    }}
                    className={cn(
                      "flex cursor-grab items-center gap-1.5 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition active:cursor-grabbing",
                      chartTab === tab.id
                        ? "bg-[color-mix(in_srgb,var(--pv-accent)_12%,transparent)] text-[var(--pv-accent-strong)] shadow-[inset_3px_0_0_0_var(--pv-accent)]"
                        : "text-[var(--pv-muted-2)] hover:bg-[var(--pv-hover)] hover:text-[var(--pv-fg)]",
                      draggingChartTab === tab.id && "opacity-40",
                      dragOverChartTab === tab.id &&
                        draggingChartTab &&
                        draggingChartTab !== tab.id &&
                        "bg-[color-mix(in_srgb,var(--pv-accent)_8%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--pv-accent)_35%,transparent)]"
                    )}
                  >
                    <GripVertical size={12} className="shrink-0 text-[var(--pv-muted)] opacity-60" />
                    <span className="min-w-0 leading-snug">{tab.label}</span>
                  </button>
                ))}
              </nav>
            </aside>
          )}

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          {mainView === "schedule" ? (
            <SchedulePanel user={user} patients={patients} onSelectPatient={selectPatient} />
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
          ) : mainView === "unsignedNotes" ? (
            <UnsignedNotesPanel
              refreshKey={unsignedNotesRefreshKey}
              isAdmin={user.role === "ADMIN"}
              onOpenEncounter={({ patientId, encounterId }) => {
                void selectPatient(
                  { id: patientId },
                  {
                    encounterId,
                    openNotesBranch: true,
                    openNote: true,
                  },
                ).then(() => {
                  void refreshUnsignedNotesSummary();
                });
              }}
            />
          ) : mainView === "contacts" ? (
            <ContactsPanel canEdit={user.role !== "READONLY"} />
          ) : !current ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--pv-muted)]">
              Select a patient to view chart
            </div>
          ) : (
            <>
              <div className={cn("flex min-h-0 flex-1 flex-col", chartTab !== "encounters" && "hidden")}>
                <ChartEncountersPanel
                  patientId={current.id}
                  chartInsertData={chartInsertData}
                  patientDiagnosis={current.diagnosis}
                  isReadOnly={!!isChartReadOnly}
                  canRemoveRecords={canRemoveRecords}
                  navigationIntent={chartNavigationIntent}
                  onNavigationComplete={() => setChartNavigationIntent(null)}
                  onPatientDataChange={refreshNotes}
                />
              </div>
              <div className={cn("flex min-h-0 flex-1 flex-col", chartTab !== "notes" && "hidden")}>
                <ChartNotesPanel
                  isReadOnly={!!isChartReadOnly}
                  patientId={current.id}
                  notes={notes}
                  chartInsertData={chartInsertData}
                  patientDiagnosis={current.diagnosis}
                  canRemoveRecords={canRemoveRecords}
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
                      patientId={current.id}
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
              <div className={cn("flex min-h-0 flex-1 flex-col", chartTab !== "orders" && "hidden")}>
                <OrdersPanel
                  patientId={current.id}
                  isReadOnly={!!isChartReadOnly}
                  canRemoveRecords={canRemoveRecords}
                  showEncounterContext
                />
              </div>
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

      {current && (
        <PatientPersonalNoteModal
          open={modal === "personalNote"}
          onClose={() => setModal(null)}
          patient={current}
        />
      )}

      {current && (
        <AiListenModal
          open={modal === "aiListen"}
          onClose={() => setModal(null)}
          patientId={current.id}
          patientName={formatDisplayName(current)}
        />
      )}

      <AuditModal open={modal === "audit"} onClose={() => setModal(null)} />
      <UsersAdminModal open={modal === "users"} onClose={() => setModal(null)} />
      <AccountSecurityModal
        open={modal === "security"}
        onClose={() => setModal(null)}
        mfaEnabled={!!user.mfaEnabled}
        onMfaChange={(enabled) => setUser((u) => ({ ...u, mfaEnabled: enabled }))}
      />
      <Toast message={toast.message} type={toast.type} />
    </div>

      <ChangePasswordModal
        open={mustChangePassword}
        forced
        onComplete={() => {
          setMustChangePassword(false);
          setUser((u) => ({ ...u, mustChangePassword: false }));
          setToast({ message: "Password updated", type: "success" });
        }}
      />
    </>
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
          <label className="ml-auto flex items-center gap-2 text-xs text-[var(--pv-muted-2)]">
            <input
              type="checkbox"
              checked={!!includeArchived}
              onChange={(e) => onToggleArchived(e.target.checked)}
              className="rounded border-[var(--pv-border-strong)]"
            />
            Show archived
          </label>
        )}
      </div>
      <p className="mb-3 text-xs text-[var(--pv-muted)]">{patients.length} patients</p>
      <div className="space-y-2">
        {patients.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className={cn(
              "w-full rounded-xl border px-4 py-3 text-left transition hover:bg-[var(--pv-btn)]",
              p.id === currentId ? "border-cyan-500/50 bg-cyan-500/5" : "border-[var(--pv-border)] bg-[var(--pv-panel)]"
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
            <div className="text-xs text-[var(--pv-muted)]">
              {[p.mrn, p.dateOfBirth ? `DOB ${formatDateOnly(p.dateOfBirth)}` : null, p.phone]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="text-xs text-[var(--pv-muted)]">Updated {formatDate(p.updatedAt)}</div>
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
  patientDiagnosis,
  isReadOnly,
  canRemoveRecords,
  onRefresh,
}: {
  patientId: string;
  notes: Note[];
  chartInsertData: PatientChartInsertSnapshot;
  patientDiagnosis?: string | null;
  isReadOnly: boolean;
  canRemoveRecords?: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [pickingType, setPickingType] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [listWidth, setListWidth] = useState(NOTES_LIST_WIDTH_DEFAULT);
  const [resizingList, setResizingList] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null;

  const listFontScale = notesListFontScale(listWidth);
  const listFontPx = Math.round(11 * listFontScale);

  useEffect(() => {
    setListWidth(loadNotesListWidth());
  }, []);

  useEffect(() => {
    if (!resizingList) return;

    function onMove(e: PointerEvent) {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = clampNotesListWidth(e.clientX - rect.left);
      setListWidth(next);
    }

    function onUp() {
      setResizingList(false);
      setListWidth((w) => {
        persistNotesListWidth(w);
        return w;
      });
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [resizingList]);

  useEffect(() => {
    if (activeNoteId && !notes.some((n) => n.id === activeNoteId)) {
      setActiveNoteId(null);
    }
  }, [activeNoteId, notes]);

  async function refreshActiveNote() {
    await onRefresh();
  }

  async function createNote(type: NoteType) {
    if (isReadOnly || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const data = await api<{ note: Note }>(`/api/patients/${patientId}/notes`, {
        method: "POST",
        json: {
          date: toDateInputValue(new Date()),
          type,
        },
      });
      setPickingType(false);
      await onRefresh();
      setActiveNoteId(data.note.id);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Could not create note.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={splitRef} className="flex min-h-0 flex-1 overflow-hidden">
      <aside
        className="flex shrink-0 flex-col overflow-hidden pr-1"
        style={{
          width: listWidth,
          fontSize: listFontPx,
        }}
      >
        <div className="mb-[0.55em] flex items-center justify-between gap-[0.45em]">
          <p className="text-[0.9em] font-semibold uppercase tracking-wider text-[var(--pv-muted)]">
            Notes
          </p>
          {!isReadOnly && (
            <Button
              variant="success"
              className="!h-[1.9em] !gap-[0.25em] !px-[0.55em] !text-[0.9em]"
              disabled={creating}
              onClick={() => {
                setPickingType(true);
                setCreateError("");
              }}
            >
              <Plus size={Math.max(10, Math.round(12 * listFontScale))} /> Add note
            </Button>
          )}
        </div>

        {pickingType && (
          <div className="mb-[0.55em] rounded-lg border border-[var(--pv-border)] bg-[var(--pv-panel)] p-[0.55em]">
            <div className="mb-[0.4em] flex items-center justify-between gap-[0.45em]">
              <span className="text-[0.9em] font-semibold uppercase tracking-wide text-cyan-200">
                Choose type
              </span>
              <Button
                className="!h-[1.7em] !px-[0.55em] !text-[0.9em]"
                disabled={creating}
                onClick={() => {
                  setPickingType(false);
                  setCreateError("");
                }}
              >
                Cancel
              </Button>
            </div>

            <div className="grid max-h-[16em] gap-[0.25em] overflow-y-auto">
              {NOTE_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  disabled={creating}
                  onClick={() => void createNote(type.value)}
                  className="rounded border border-[var(--pv-border)] bg-[var(--pv-panel-deep)] px-[0.55em] py-[0.4em] text-left transition hover:border-cyan-500/40 disabled:opacity-50"
                >
                  <span className="block text-[1em] font-medium text-cyan-200">{type.label}</span>
                  <span className="block text-[0.9em] text-[var(--pv-muted)]">{type.description}</span>
                </button>
              ))}
            </div>
            {createError && <p className="mt-[0.4em] text-[0.9em] text-rose-300">{createError}</p>}
            {creating && <p className="mt-[0.4em] text-[0.9em] text-cyan-300">Creating note…</p>}
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-[0.25em] overflow-y-auto">
          {notes.length === 0 ? (
            <p className="px-[0.25em] text-[1em] text-[var(--pv-muted)]">No notes yet.</p>
          ) : (
            notes.map((n) => {
              const status = n.status ?? "DRAFT";
              const isSigned = status === "SIGNED";
              const isRevised = isSigned && (n.revisionCount ?? 0) > 0;
              const selected = n.id === activeNoteId;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setActiveNoteId(n.id)}
                  className={cn(
                    "flex w-full flex-col gap-[0.15em] rounded-lg border px-[0.7em] py-[0.55em] text-left transition",
                    selected
                      ? "border-cyan-500/45 bg-[color-mix(in_srgb,var(--pv-accent)_12%,transparent)] shadow-[inset_3px_0_0_0_var(--pv-accent)]"
                      : "border-[var(--pv-border)] bg-[var(--pv-panel)] hover:border-cyan-500/35 hover:bg-[var(--pv-btn)]"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-[0.4em]">
                    <span className="truncate text-[1.1em] font-medium text-cyan-200">
                      {getNoteTypeLabel(n.type)}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-[0.3em] py-[0.1em] text-[0.8em] font-semibold uppercase tracking-wide",
                        !isSigned
                          ? "bg-amber-500/15 text-amber-300"
                          : isRevised
                            ? "bg-orange-500/15 text-orange-300"
                            : "bg-emerald-500/15 text-emerald-300"
                      )}
                    >
                      {getNoteStatusLabel(n)}
                    </span>
                  </div>
                  <span className="truncate text-[0.9em] text-[var(--pv-muted-2)]">
                    {formatDate(n.date)}
                    {n.encounter
                      ? ` · ${formatEncounterLabel(n.encounter.visitCategory, n.encounter.modality)}`
                      : ""}
                  </span>
                  <span className="truncate text-[0.9em] text-[var(--pv-muted)]">
                    {getNoteAuthorLabel(n)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize notes list"
        aria-valuenow={listWidth}
        aria-valuemin={NOTES_LIST_WIDTH_MIN}
        aria-valuemax={NOTES_LIST_WIDTH_MAX}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault();
          setResizingList(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            setListWidth((w) => {
              const next = clampNotesListWidth(w - 16);
              persistNotesListWidth(next);
              return next;
            });
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setListWidth((w) => {
              const next = clampNotesListWidth(w + 16);
              persistNotesListWidth(next);
              return next;
            });
          }
        }}
        className={cn(
          "group relative z-10 flex w-3 shrink-0 cursor-col-resize items-center justify-center",
          resizingList && "bg-cyan-500/10"
        )}
      >
        <div
          className={cn(
            "h-full w-px bg-[var(--pv-border-strong)] transition group-hover:bg-cyan-400/70",
            resizingList && "bg-cyan-400"
          )}
        />
        <GripVertical
          size={12}
          className={cn(
            "pointer-events-none absolute text-[var(--pv-muted)] opacity-0 transition group-hover:opacity-100",
            resizingList && "text-cyan-300 opacity-100"
          )}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pl-1">
        {activeNote ? (
          <StructuredNoteEditor
            key={activeNote.id}
            patientId={patientId}
            note={{
              id: activeNote.id,
              type: activeNote.type,
              status: activeNote.status ?? "DRAFT",
              date: activeNote.date,
              content: activeNote.content,
              signedAt: activeNote.signedAt,
              createdAt: activeNote.createdAt,
              revisionCount: activeNote.revisionCount,
              lastRevisedAt: activeNote.lastRevisedAt,
              lastRevisedByName: activeNote.lastRevisedByName,
              encounterId: activeNote.encounterId,
              authorName: activeNote.authorName,
              signedByName: activeNote.signedByName,
              createdBy: activeNote.createdBy,
              signedBy: activeNote.signedBy,
              lastRevisedBy: activeNote.lastRevisedBy,
              revisions: activeNote.revisions,
            }}
            chartInsertData={chartInsertData}
            patientDiagnosis={patientDiagnosis}
            isReadOnly={isReadOnly}
            canDeleteNote={!!canRemoveRecords}
            onBack={() => setActiveNoteId(null)}
            onSaved={refreshActiveNote}
            onSigned={refreshActiveNote}
            onDeleted={async () => {
              setActiveNoteId(null);
              await onRefresh();
            }}
            backLabel="Close note"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--pv-border)] bg-[var(--pv-panel)]/40 px-6 text-center text-sm text-[var(--pv-muted)]">
            {pickingType
              ? "Pick a note type to start charting."
              : "Select a note from the list, or add a new one."}
          </div>
        )}
      </div>
    </div>
  );
}

function ChartSectionPanel({
  patientId,
  sectionKey,
  value,
  isActive,
  isReadOnly,
  onSave,
  canRemoveRecords,
}: {
  patientId: string;
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
  const supportsUploads = isChartUploadSection(sectionKey);
  const supportsTextReports = isTextReportSection(sectionKey);

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
        {!isReadOnly && !supportsTextReports && <AutoSaveStatus saving={saving} dirty={dirty} />}
      </div>

      {supportsTextReports ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <SectionTextReports
            patientId={patientId}
            sectionKey={sectionKey as TextReportSectionKey}
            readOnly={isReadOnly}
          />
          <SectionDocumentUploads
            patientId={patientId}
            sectionKey={sectionKey}
            readOnly={isReadOnly}
          />
        </div>
      ) : supportsUploads ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SectionDocumentUploads
              patientId={patientId}
              sectionKey={sectionKey}
              readOnly={isReadOnly}
            />
          </div>
          <div className="mt-3 shrink-0 space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[#8aa0bd]">
              Notes / interpretation
            </label>
            <Textarea
              autoGrow
              minHeightPx={44}
              className="!py-2 !text-sm"
              value={content}
              onChange={(e) => {
                const next = e.target.value;
                setDirty(true);
                setContent(next);
                debouncedPersist(next);
              }}
              disabled={isReadOnly}
              placeholder={
                isReadOnly ? "Read-only" : `Brief notes for ${label.toLowerCase()}...`
              }
              rows={1}
            />
          </div>
        </>
      ) : (
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
      )}

      {!isReadOnly && !supportsTextReports && (
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
  const [encounters, setEncounters] = useState<{ id: string; label: string }[]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [faxOpen, setFaxOpen] = useState(false);
  const [faxDocIds, setFaxDocIds] = useState<string[]>([]);
  const [faxNotice, setFaxNotice] = useState("");
  const [viewerDoc, setViewerDoc] = useState<DocumentItem | null>(null);

  const load = useCallback(async () => {
    const [docData, encData] = await Promise.all([
      api<{ documents: DocumentItem[] }>(`/api/patients/${patientId}/documents`),
      api<{
        encounters: {
          id: string;
          visitCategory: string;
          modality: string;
          date: string;
        }[];
      }>(`/api/patients/${patientId}/encounters`),
    ]);
    setDocs(docData.documents);
    setEncounters(
      encData.encounters.map((enc) => ({
        id: enc.id,
        label: `${formatEncounterLabel(enc.visitCategory, enc.modality)} · ${formatDateOnly(enc.date)}`,
      }))
    );
    setSelectedIds((prev) =>
      prev.filter((id) => docData.documents.some((d) => d.id === id && d.canFax === true))
    );
  }, [patientId]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const faxableDocs = docs.filter((d) => d.canFax === true);

  const allSelected =
    faxableDocs.length > 0 && faxableDocs.every((d) => selectedIds.includes(d.id));

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? [] : faxableDocs.map((d) => d.id));
  }

  function openFaxFor(ids: string[]) {
    if (ids.length === 0) {
      setFaxNotice("Select at least one uploaded document to fax.");
      return;
    }
    if (encounters.length === 0) {
      setFaxNotice("Create an encounter first so faxes can be filed in the chart.");
      return;
    }
    setFaxNotice("");
    setFaxDocIds(ids);
    setFaxOpen(true);
  }

  function kindLabel(kind: DocumentItem["kind"]) {
    if (kind === "note") return "Note";
    if (kind === "form") return "Form";
    if (kind === "report") return "Report";
    return "Upload";
  }

  function kindClass(kind: DocumentItem["kind"]) {
    if (kind === "note") return "border-sky-500/40 bg-sky-500/10 text-sky-200";
    if (kind === "form") return "border-violet-500/40 bg-violet-500/10 text-violet-200";
    if (kind === "report") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  }

  function openDocument(doc: DocumentItem) {
    setViewerDoc(doc);
  }

  function onFileSelected(selected: File | null) {
    setFile(selected);
    setUploadError(null);
    if (selected && !name.trim()) {
      setName(selected.name.replace(/\.[^.]+$/, "") || selected.name);
    }
  }

  async function upload() {
    if (!file) {
      setUploadError("Choose a file first.");
      return;
    }
    if (!name.trim()) {
      setUploadError("Enter a document name.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name.trim());
      const res = await fetch(`/api/patients/${patientId}/documents/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setUploadError(data?.error ?? `Upload failed (${res.status}). Try a smaller file (max 25MB).`);
        return;
      }
      setName("");
      setFile(null);
      setFileInputKey((k) => k + 1);
      await load();
    } catch {
      setUploadError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  function startRename(doc: DocumentItem) {
    setRenamingId(doc.id);
    setRenameValue(doc.name);
    setRenameError("");
    setFaxNotice("");
  }

  async function saveRename() {
    if (!renamingId) return;
    const nextName = renameValue.trim();
    if (!nextName) {
      setRenameError("Enter a document name.");
      return;
    }
    setRenaming(true);
    setRenameError("");
    try {
      await api(`/api/patients/${patientId}/documents/${renamingId}`, {
        method: "PATCH",
        json: { name: nextName },
      });
      setRenamingId(null);
      setRenameValue("");
      await load();
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : "Could not rename document.");
    } finally {
      setRenaming(false);
    }
  }

  const faxDocuments = faxableDocs.map((d) => ({ id: d.id, name: d.name, fileName: d.fileName }));
  const preferredEncounterId = (() => {
    const fromSelected = faxDocIds
      .map((id) => docs.find((d) => d.id === id)?.encounterId)
      .filter((id): id is string => Boolean(id));
    const unique = [...new Set(fromSelected)];
    if (unique.length === 1) return unique[0];
    return encounters[0]?.id ?? null;
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-cyan-300">
            <Upload size={16} className="mr-1 inline" /> Documents
          </h2>
          <p className="mt-1 text-xs text-[var(--pv-muted)]">
            Notes, forms, and uploaded files
            {showEncounterBadge ? " across all encounters." : "."}
          </p>
        </div>
        {!isReadOnly && faxableDocs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button className="!text-xs" onClick={toggleSelectAll}>
              {allSelected ? "Clear selection" : "Select all uploads"}
            </Button>
            <Button
              variant="success"
              className="!text-xs"
              disabled={selectedIds.length === 0}
              onClick={() => openFaxFor(selectedIds)}
            >
              Fax selected{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
            </Button>
          </div>
        )}
      </div>

      {!isReadOnly && (
        <div className="mb-4 rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] p-3">
          <div className="grid gap-2 md:grid-cols-3">
            <Input
              placeholder="Document name (required)"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setUploadError(null);
              }}
            />
            <Input
              key={fileInputKey}
              type="file"
              onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="success"
              disabled={uploading || !file || !name.trim()}
              onClick={upload}
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
          {file && (
            <p className="mt-2 text-xs text-[var(--pv-muted)]">
              Selected: {file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)
            </p>
          )}
          {uploadError && <p className="mt-2 text-xs text-red-400">{uploadError}</p>}
        </div>
      )}

      {selectedIds.length > 0 && !isReadOnly && (
        <p className="mb-2 text-xs text-cyan-300/90">
          {selectedIds.length} document{selectedIds.length === 1 ? "" : "s"} selected for faxing.
        </p>
      )}
      {faxNotice && (
        <p className="mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {faxNotice}
        </p>
      )}
      {renameError && (
        <p className="mb-2 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {renameError}
        </p>
      )}

      <div className="space-y-2">
        {docs.length === 0 && <p className="text-sm text-[var(--pv-muted)]">No documents yet.</p>}
        {docs.map((d) => {
          const checked = selectedIds.includes(d.id);
          const canSelect = d.canFax === true;
          const canRename = d.canRename === true;
          const canDelete = d.canDelete === true;
          return (
            <div
              key={d.id}
              role="button"
              tabIndex={renamingId === d.id ? -1 : 0}
              onClick={() => {
                if (renamingId === d.id) return;
                openDocument(d);
              }}
              onKeyDown={(e) => {
                if (renamingId === d.id) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openDocument(d);
                }
              }}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border bg-[var(--pv-panel)] px-4 py-3 transition",
                renamingId === d.id
                  ? "cursor-default"
                  : "cursor-pointer hover:border-cyan-500/35 hover:bg-[color-mix(in_srgb,var(--pv-hover)_70%,transparent)]",
                checked ? "border-cyan-500/40" : "border-[var(--pv-border)]"
              )}
            >
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {!isReadOnly && canSelect && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelected(d.id);
                    }}
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                      checked
                        ? "border-cyan-400 bg-cyan-500/30 text-cyan-100"
                        : "border-[#3a4a63] bg-transparent hover:border-cyan-500/50"
                    )}
                    aria-label={checked ? `Deselect ${d.name}` : `Select ${d.name}`}
                  >
                    {checked ? <span className="text-[11px] leading-none">✓</span> : null}
                  </button>
                )}
                {!isReadOnly && !canSelect && <div className="mt-0.5 h-5 w-5 shrink-0" />}
                <div className="min-w-0 flex-1" onClick={(e) => renamingId === d.id && e.stopPropagation()}>
                  {renamingId === d.id ? (
                    <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Input
                        className="!h-8 max-w-md !text-sm"
                        value={renameValue}
                        autoFocus
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveRename();
                          }
                          if (e.key === "Escape") {
                            setRenamingId(null);
                            setRenameError("");
                          }
                        }}
                      />
                      <Button className="!h-8 !text-xs" disabled={renaming || !renameValue.trim()} onClick={saveRename}>
                        {renaming ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        className="!h-8 !text-xs"
                        disabled={renaming}
                        onClick={() => {
                          setRenamingId(null);
                          setRenameError("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-cyan-200">{d.name}</div>
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                            kindClass(d.kind)
                          )}
                        >
                          {kindLabel(d.kind)}
                        </span>
                        {getDocumentSectionLabel(d.sectionKey) && (
                          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-200">
                            {getDocumentSectionLabel(d.sectionKey)}
                          </span>
                        )}
                        {d.status && (
                          <span className="text-[10px] uppercase tracking-wide text-[var(--pv-muted-2)]">
                            {d.status}
                          </span>
                        )}
                      </div>
                      {d.authorName && (
                        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-sky-500/35 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-100">
                          <User size={12} className="shrink-0 text-sky-300" aria-hidden />
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/90">
                            Author
                          </span>
                          <span className="text-sky-50">{d.authorName}</span>
                        </div>
                      )}
                      <div className="mt-1 text-xs text-[var(--pv-muted)]">
                        {d.fileName}
                        {d.fileSize > 0 ? ` · ${(d.fileSize / 1024).toFixed(1)} KB` : ""}
                        {" · "}
                        {formatDate(d.uploadedAt)}
                      </div>
                    </>
                  )}
                  {showEncounterBadge && d.encounter && (
                    <div className="mt-1 text-[10px] text-violet-300">
                      {formatEncounterLabel(d.encounter.visitCategory, d.encounter.modality)} ·{" "}
                      {formatDateOnly(d.encounter.date)}
                    </div>
                  )}
                  {showEncounterBadge && !d.encounter && (
                    <div className="mt-1 text-[10px] text-[var(--pv-muted-2)]">No encounter</div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
                {!isReadOnly && canRename && renamingId !== d.id && (
                  <Button className="!text-xs" onClick={() => startRename(d)}>
                    Rename
                  </Button>
                )}
                <Button className="!text-xs" onClick={() => openDocument(d)}>
                  Open
                </Button>
                {!isReadOnly && canRemoveRecords && canDelete && (
                  <Button variant="danger" className="!text-xs" onClick={() => setDeleteDocId(d.id)}>
                    Delete
                  </Button>
                )}
              </div>
            </div>
          );
        })}
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

      {viewerDoc &&
        (viewerDoc.kind === "report" || isTextReportDocument(viewerDoc) ? (
          <TextReportDocumentEditor
            patientId={patientId}
            documentId={viewerDoc.sourceId ?? viewerDoc.id}
            title={viewerDoc.name}
            readOnly={isReadOnly}
            onClose={() => setViewerDoc(null)}
            onSaved={async () => {
              await load();
            }}
            backLabel="Back to Documents"
          />
        ) : (
          <FullPageDocumentViewer
            title={viewerDoc.name}
            url={viewerDoc.openUrl ?? `/api/patients/${patientId}/documents/${viewerDoc.id}`}
            mimeType={viewerDoc.mimeType}
            onClose={() => setViewerDoc(null)}
            backLabel="Back to Documents"
          />
        ))}

      <SendFaxModal
        open={faxOpen}
        onClose={() => setFaxOpen(false)}
        patientId={patientId}
        encounterId={preferredEncounterId}
        encounters={encounters}
        documents={faxDocuments}
        initialDocumentIds={faxDocIds}
        onSent={async () => {
          setSelectedIds([]);
          setFaxDocIds([]);
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
    if (!input.trim() || loading) return;
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
    <Modal open={open} onClose={onClose} title={`Ask AI — ${patientName}`} xl className="max-w-4xl">
      <p className="mb-3 text-sm text-[var(--pv-muted)]">
        Powered by AWS Bedrock (HIPAA BAA). Uses this patient&apos;s chart text, notes, forms, orders, and attached PDFs/images.
        Queries are audit-logged.
      </p>
      <div className="mb-3 max-h-[55vh] min-h-[280px] space-y-3 overflow-y-auto rounded-xl border border-[var(--pv-border)] bg-[var(--pv-bg-deep)] p-3">
        {messages.length === 0 && (
          <div className="space-y-2 text-sm text-[var(--pv-muted-2)]">
            <p>Try questions like:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Has this patient had PFTs before?</li>
              <li>Summarize recent imaging findings</li>
              <li>What medications are documented?</li>
              <li>Or tap <span className="text-cyan-300">Guidelines</span> for continue / stop / labs / imaging / vaccines</li>
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
              m.role === "user" ? "ml-8 bg-sky-900/50" : "mr-8 bg-[var(--pv-btn)]"
            )}
          >
            {m.content}
          </div>
        ))}
        {loading && <p className="text-center text-sm text-cyan-400">Reading chart &amp; documents...</p>}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Ask about this patient chart..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          disabled={loading}
        />
        <Button variant="primary" onClick={send} disabled={loading || !input.trim()}>
          {loading ? "..." : "Send"}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          variant="primary"
          className="!text-xs"
          disabled={loading}
          onClick={async () => {
            if (loading) return;
            setMessages((m) => [
              ...m,
              {
                role: "user",
                content:
                  "Guidelines review — continue / stop / start, labs, imaging, testing, vaccines, treatments.",
              },
            ]);
            setLoading(true);
            try {
              const res = await api<{ response: string }>(
                `/api/patients/${patientId}/ai/guidelines`,
                { method: "POST" }
              );
              setMessages((m) => [...m, { role: "assistant", content: res.response }]);
            } catch (e) {
              setMessages((m) => [
                ...m,
                {
                  role: "assistant",
                  content: `Error: ${e instanceof Error ? e.message : "failed"}`,
                },
              ]);
            } finally {
              setLoading(false);
            }
          }}
        >
          Guidelines
        </Button>
        <Button
          variant="danger"
          className="!text-xs"
          disabled={loading}
          onClick={async () => {
            await api(`/api/patients/${patientId}/ai`, { method: "DELETE" });
            setMessages([]);
          }}
        >
          Clear History
        </Button>
      </div>
    </Modal>
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
          <span className="text-xs text-[var(--pv-muted)]">{detail.patients.length} patients</span>
        </div>
        <div className="mb-4 flex max-w-xl gap-2">
          <select
            className="flex-1 rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 py-2 text-sm"
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
            <p className="rounded-xl border border-dashed border-[var(--pv-border)] px-4 py-8 text-center text-sm text-[var(--pv-muted)]">
              No patients in this list yet
            </p>
          ) : (
            detail.patients.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] px-4 py-3"
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
          <p className="rounded-xl border border-dashed border-[var(--pv-border)] px-4 py-8 text-center text-sm text-[var(--pv-muted)]">
            No lists yet — create one above
          </p>
        ) : (
          lists.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setDetail(l)}
              className="flex w-full items-center justify-between rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] px-4 py-3 text-left transition hover:bg-[var(--pv-btn)]"
            >
              <div>
                <div className="font-medium text-cyan-200">{l.name}</div>
                <div className="text-xs text-[var(--pv-muted)]">{l.patients.length} patients</div>
              </div>
              <span className="text-[var(--pv-muted)]">→</span>
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
          <div key={l.id} className="grid grid-cols-4 gap-2 rounded-lg border border-[var(--pv-border)] bg-[var(--pv-panel)] px-3 py-2">
            <span className="text-[var(--pv-muted-2)]">{formatDate(l.createdAt)}</span>
            <span className="text-cyan-300">{l.action}</span>
            <span>{l.resource}</span>
            <span className="truncate text-[var(--pv-muted)]">{l.user?.email ?? "—"}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
