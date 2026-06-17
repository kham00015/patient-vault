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
import { cn, formatDate, toDateInputValue } from "@/lib/utils";
import {
  Bot,
  Calendar,
  ClipboardList,
  Cloud,
  FileText,
  FolderOpen,
  Lightbulb,
  List,
  LogOut,
  Plus,
  Search,
  Stethoscope,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

type Patient = {
  id: string;
  name: string;
  noteDraft?: string | null;
  diagnosis?: string | null;
  pmh?: string | null;
  echo?: string | null;
  pft?: string | null;
  sleep?: string | null;
  labs?: string | null;
  imaging?: string | null;
  medications?: string | null;
  social?: string | null;
  updatedAt: string;
};

type Note = { id: string; date: string; content: string };
type KBDoc = { id: string; title: string; content: string; updatedAt: string };
type PatientList = { id: string; name: string; patients: { id: string; name: string }[] };
type DocumentItem = {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
};

type ModalType =
  | "patients"
  | "add"
  | "delete"
  | "schedule"
  | "kb"
  | "notes"
  | "documents"
  | "upload"
  | "lists"
  | "listDetail"
  | "ai"
  | "section"
  | "audit"
  | null;

export default function PatientVaultApp({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [current, setCurrent] = useState<Patient | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [modal, setModal] = useState<ModalType>(null);
  const [sectionKey, setSectionKey] = useState<MedicalSectionKey | "diagnosis">("pmh");
  const [toast, setToast] = useState({ message: "", type: "info" as "info" | "success" | "error" });
  const [search, setSearch] = useState("");
  const [newPatientName, setNewPatientName] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = (message: string, type: "info" | "success" | "error" = "info") =>
    setToast({ message, type });

  const loadPatients = useCallback(async (q = "") => {
    const data = await api<{ patients: Patient[] }>(`/api/patients${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    setPatients(data.patients);
  }, []);

  const selectPatient = useCallback(async (patient: Patient) => {
    const data = await api<{ patient: Patient }>(`/api/patients/${patient.id}`);
    setCurrent(data.patient);
    setNoteDraft(data.patient.noteDraft ?? "");
    const notesData = await api<{ notes: Note[] }>(`/api/patients/${patient.id}/notes`);
    setNotes(notesData.notes);
    setModal(null);
    notify(`Opened ${data.patient.name}`, "success");
  }, []);

  useEffect(() => {
    loadPatients().catch((e) => notify(e.message, "error"));
  }, [loadPatients]);

  const saveDraft = useCallback(
    async (content: string) => {
      if (!current) return;
      setSaving(true);
      try {
        const data = await api<{ patient: Patient }>(`/api/patients/${current.id}`, {
          method: "PATCH",
          json: { noteDraft: content },
        });
        setCurrent(data.patient);
      } catch (e) {
        notify(e instanceof Error ? e.message : "Save failed", "error");
      } finally {
        setSaving(false);
      }
    },
    [current]
  );

  function onDraftChange(value: string) {
    setNoteDraft(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft(value), 1000);
  }

  async function logout() {
    await api("/api/auth/login", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  async function addPatient() {
    if (!newPatientName.trim()) return notify("Enter a name", "error");
    try {
      const data = await api<{ patient: Patient }>("/api/patients", {
        method: "POST",
        json: { name: newPatientName.trim() },
      });
      await loadPatients();
      setNewPatientName("");
      setModal(null);
      await selectPatient(data.patient);
      notify("Patient added", "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function deletePatient() {
    if (!current) return;
    try {
      await api(`/api/patients/${current.id}`, { method: "DELETE" });
      setCurrent(null);
      setNoteDraft("");
      setNotes([]);
      await loadPatients();
      setModal(null);
      notify("Patient deleted", "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  const sectionValue = useMemo(() => {
    if (!current) return "";
    return String(current[sectionKey as keyof Patient] ?? "");
  }, [current, sectionKey]);

  async function saveSection(value: string) {
    if (!current) return;
    try {
      const data = await api<{ patient: Patient }>(`/api/patients/${current.id}`, {
        method: "PATCH",
        json: { [sectionKey]: value },
      });
      setCurrent(data.patient);
      notify("Saved", "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Save failed", "error");
    }
  }

  const menuItems = [
    { id: "patients", label: "Patient List", icon: Users, color: "text-sky-400" },
    { id: "add", label: "Add Patient", icon: Plus, color: "text-emerald-400" },
    { id: "delete", label: "Delete Patient", icon: Trash2, color: "text-rose-400", disabled: !current },
    { id: "ai", label: "Ask AI", icon: Bot, color: "text-violet-400", disabled: !current },
    { id: "schedule", label: "Clinic Schedule", icon: Calendar, color: "text-amber-400" },
    { id: "kb", label: "Knowledge Base", icon: FolderOpen, color: "text-purple-400" },
    { id: "notes", label: "Notes", icon: FileText, color: "text-blue-400", disabled: !current },
    { id: "lists", label: "Lists", icon: List, color: "text-fuchsia-400" },
  ] as const;

  return (
    <div className="flex h-screen gap-4 p-3 md:p-4">
      <aside className="flex w-full max-w-[280px] shrink-0 flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#6b7c93]">Patient Vault</p>
            <p className="text-sm font-medium text-cyan-300">{user.name ?? user.email}</p>
          </div>
          <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-400">Secure</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {menuItems.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              className="!justify-start gap-3 border border-transparent hover:border-[#2d3f57] hover:bg-[#151d29]"
              disabled={"disabled" in item && item.disabled}
              onClick={() => setModal(item.id as ModalType)}
            >
              <item.icon size={18} className={item.color} />
              {item.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            className="!justify-start gap-3"
            onClick={() => window.open("https://onedrive.live.com", "_blank")}
          >
            <Cloud size={18} className="text-sky-400" /> OneDrive
          </Button>
          <Button
            variant="ghost"
            className="!justify-start gap-3"
            onClick={() => window.open("https://codepen.io/Firas-Khamis/live/NPrvRbQ", "_blank")}
          >
            <Lightbulb size={18} className="text-amber-400" /> Potentials
          </Button>
          {user.role === "ADMIN" && (
            <Button variant="ghost" className="!justify-start gap-3" onClick={() => setModal("audit")}>
              <ClipboardList size={18} className="text-cyan-400" /> Audit Log
            </Button>
          )}
        </nav>

        <Button variant="ghost" className="!justify-start gap-3 text-[#8b9cb3]" onClick={logout}>
          <LogOut size={18} /> Logout
        </Button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col rounded-2xl border border-[#243044] bg-[#101722]/80">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#243044] px-4 py-3">
          <div className="flex items-center gap-2">
            <Stethoscope className="text-cyan-400" size={20} />
            <h1 className="text-lg font-semibold">
              {current ? current.name : "Select a patient"}
            </h1>
          </div>
          {current && (
            <div className="flex flex-wrap gap-2">
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
              {MEDICAL_SECTIONS.map((s) => (
                <Button
                  key={s.key}
                  className="!py-2 !text-xs"
                  onClick={() => {
                    setSectionKey(s.key);
                    setModal("section");
                  }}
                >
                  {s.icon} {s.label.split(" ")[0]}
                </Button>
              ))}
              <Button className="!py-2 !text-xs" onClick={() => setModal("documents")}>
                <Upload size={14} /> Documents
              </Button>
              <Button
                className="!py-2 !text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(noteDraft);
                  notify("Copied chart", "success");
                }}
              >
                Copy All
              </Button>
            </div>
          )}
        </header>

        <div className="flex flex-1 flex-col p-4">
          <Textarea
            className="min-h-[420px] flex-1 font-mono text-[13px]"
            placeholder={current ? "Patient chart notes — auto-saves securely on the server..." : "Select a patient to view chart"}
            value={noteDraft}
            onChange={(e) => onDraftChange(e.target.value)}
            disabled={!current}
          />
          <div className="mt-2 flex justify-between text-xs text-[#6b7c93]">
            <span>{saving ? "Saving..." : "Auto-save enabled · PHI encrypted at rest"}</span>
            <span>{current ? `Updated ${formatDate(current.updatedAt)}` : ""}</span>
          </div>
        </div>
      </main>

      <PatientsModal
        open={modal === "patients"}
        onClose={() => setModal(null)}
        patients={patients}
        search={search}
        setSearch={setSearch}
        onSearch={() => loadPatients(search)}
        currentId={current?.id}
        onSelect={selectPatient}
      />

      <Modal open={modal === "add"} onClose={() => setModal(null)} title="Add Patient">
        <Input
          placeholder="Patient name"
          value={newPatientName}
          onChange={(e) => setNewPatientName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addPatient()}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setModal(null)}>Cancel</Button>
          <Button variant="success" onClick={addPatient}>Add</Button>
        </div>
      </Modal>

      <Modal open={modal === "delete"} onClose={() => setModal(null)} title="Delete Patient">
        <p className="text-[#c9d5e3]">
          Delete <span className="font-semibold text-cyan-300">{current?.name}</span>? This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setModal(null)}>Cancel</Button>
          <Button variant="danger" onClick={deletePatient}>Delete</Button>
        </div>
      </Modal>

      <SectionModal
        open={modal === "section"}
        onClose={() => setModal(null)}
        sectionKey={sectionKey}
        value={sectionValue}
        patientName={current?.name ?? ""}
        onSave={saveSection}
      />

      {current && (
        <>
          <NotesModal
            open={modal === "notes"}
            onClose={() => setModal(null)}
            patientId={current.id}
            notes={notes}
            onRefresh={async () => {
              const data = await api<{ notes: Note[] }>(`/api/patients/${current.id}/notes`);
              setNotes(data.notes);
            }}
            diagnosis={current.diagnosis ?? ""}
          />
          <DocumentsModal
            open={modal === "documents"}
            onClose={() => setModal(null)}
            patientId={current.id}
            patientName={current.name}
          />
          <AIModal
            open={modal === "ai"}
            onClose={() => setModal(null)}
            patientId={current.id}
            patientName={current.name}
          />
        </>
      )}

      <ScheduleModal open={modal === "schedule"} onClose={() => setModal(null)} patients={patients} />
      <KnowledgeBaseModal open={modal === "kb"} onClose={() => setModal(null)} />
      <ListsModal open={modal === "lists"} onClose={() => setModal(null)} patients={patients} onSelectPatient={selectPatient} />
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
}: {
  open: boolean;
  onClose: () => void;
  patients: Patient[];
  search: string;
  setSearch: (v: string) => void;
  onSearch: () => void;
  currentId?: string;
  onSelect: (p: Patient) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Patient List" wide>
      <div className="mb-4 flex gap-2">
        <Input placeholder="Search patients..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button onClick={onSearch}><Search size={16} /></Button>
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
            <div className="font-medium text-cyan-200">{p.name}</div>
            <div className="text-xs text-[#6b7c93]">Updated {formatDate(p.updatedAt)}</div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function SectionModal({
  open,
  onClose,
  sectionKey,
  value,
  patientName,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  sectionKey: MedicalSectionKey | "diagnosis";
  value: string;
  patientName: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [content, setContent] = useState(value);
  useEffect(() => setContent(value), [value, open]);

  const label = MEDICAL_SECTIONS.find((s) => s.key === sectionKey)?.label ?? "Diagnosis";

  return (
    <Modal open={open} onClose={onClose} title={label} wide>
      <p className="mb-3 text-sm text-[#8b9cb3]">Patient: {patientName}</p>
      <Textarea className="min-h-[320px]" value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Close</Button>
        <Button variant="success" onClick={() => onSave(content)}>Save</Button>
      </div>
    </Modal>
  );
}

function NotesModal({
  open,
  onClose,
  patientId,
  notes,
  onRefresh,
  diagnosis,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  notes: Note[];
  onRefresh: () => Promise<void>;
  diagnosis: string;
}) {
  const [tab, setTab] = useState<"list" | "add">("list");
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [content, setContent] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  async function saveNote() {
    if (!content.trim()) return;
    await api(`/api/patients/${patientId}/notes`, {
      method: "POST",
      json: { date, content, noteId: editId ?? undefined },
    });
    setContent("");
    setEditId(null);
    setTab("list");
    await onRefresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="Clinical Notes" wide>
      <div className="mb-4 flex gap-2 border-b border-[#243044] pb-3">
        <Button variant={tab === "list" ? "primary" : "ghost"} onClick={() => setTab("list")}>List</Button>
        <Button variant={tab === "add" ? "primary" : "ghost"} onClick={() => { setTab("add"); setEditId(null); setContent(""); }}>Add Note</Button>
        <Input type="date" className="ml-auto max-w-[160px]" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {tab === "list" ? (
        <div className="space-y-2">
          {notes.length === 0 && <p className="text-sm text-[#6b7c93]">No notes yet.</p>}
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl border border-[#243044] bg-[#0f1520] p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-cyan-300">{formatDate(n.date)}</span>
                <div className="flex gap-2">
                  <Button className="!py-1 !text-xs" onClick={() => { setEditId(n.id); setContent(n.content); setDate(toDateInputValue(n.date)); setTab("add"); }}>Edit</Button>
                  <Button variant="danger" className="!py-1 !text-xs" onClick={async () => {
                    await api(`/api/patients/${patientId}/notes/${n.id}`, { method: "DELETE" });
                    await onRefresh();
                  }}>Delete</Button>
                </div>
              </div>
              <pre className="whitespace-pre-wrap text-sm text-[#c9d5e3]">{n.content}</pre>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-2 flex gap-2">
            <Button className="!text-xs" onClick={() => {
              if (!diagnosis) return;
              setContent((c) => (c ? `${c}\n${diagnosis}` : diagnosis));
            }}>Insert Diagnosis</Button>
          </div>
          <Textarea className="min-h-[300px]" value={content} onChange={(e) => setContent(e.target.value)} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="success" onClick={saveNote}>Save Note</Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function DocumentsModal({
  open,
  onClose,
  patientId,
  patientName,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
}) {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ documents: DocumentItem[] }>(`/api/patients/${patientId}/documents`);
    setDocs(data.documents);
  }, [patientId]);

  useEffect(() => {
    if (open) load().catch(() => undefined);
  }, [open, load]);

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
    <Modal open={open} onClose={onClose} title={`Documents — ${patientName}`} wide>
      <div className="mb-4 grid gap-2 rounded-xl border border-[#243044] bg-[#0f1520] p-3 md:grid-cols-3">
        <Input placeholder="Document name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button variant="success" onClick={upload}>Upload</Button>
      </div>
      <div className="space-y-2">
        {docs.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-xl border border-[#243044] bg-[#0f1520] px-4 py-3">
            <div>
              <div className="font-medium text-cyan-200">{d.name}</div>
              <div className="text-xs text-[#6b7c93]">{d.fileName} · {(d.fileSize / 1024).toFixed(1)} KB</div>
            </div>
            <div className="flex gap-2">
              <Button className="!text-xs" onClick={() => window.open(`/api/patients/${patientId}/documents/${d.id}`, "_blank")}>Open</Button>
              <Button variant="danger" className="!text-xs" onClick={async () => {
                await api(`/api/patients/${patientId}/documents/${d.id}`, { method: "DELETE" });
                await load();
              }}>Delete</Button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
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

function ScheduleModal({ open, onClose, patients }: { open: boolean; onClose: () => void; patients: Patient[] }) {
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [scheduled, setScheduled] = useState<{ id: string; name: string }[]>([]);
  const [patientId, setPatientId] = useState("");

  const load = useCallback(async () => {
    const data = await api<{ patients: { id: string; name: string }[] }>(`/api/schedule?date=${date}`);
    setScheduled(data.patients);
  }, [date]);

  useEffect(() => {
    if (open) load().catch(() => undefined);
  }, [open, load]);

  return (
    <Modal open={open} onClose={onClose} title="Clinic Schedule" wide>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mb-4 max-w-[200px]" />
      <div className="mb-4 flex gap-2">
        <select className="flex-1 rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2 text-sm" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
          <option value="">Select patient...</option>
          {patients.filter((p) => !scheduled.some((s) => s.id === p.id)).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <Button variant="success" onClick={async () => {
          if (!patientId) return;
          await api("/api/schedule", { method: "POST", json: { date, patientId } });
          setPatientId("");
          await load();
        }}>Add</Button>
      </div>
      <div className="space-y-2">
        {scheduled.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-xl border border-[#243044] bg-[#0f1520] px-4 py-2">
            <span>{p.name}</span>
            <Button variant="danger" className="!text-xs" onClick={async () => {
              await api("/api/schedule", { method: "DELETE", json: { date, patientId: p.id } });
              await load();
            }}>Remove</Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function KnowledgeBaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [docs, setDocs] = useState<KBDoc[]>([]);
  const [tab, setTab] = useState<"list" | "edit">("list");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ documents: KBDoc[] }>("/api/knowledge-base");
    setDocs(data.documents);
  }, []);

  useEffect(() => {
    if (open) load().catch(() => undefined);
  }, [open, load]);

  async function save() {
    await api("/api/knowledge-base", { method: "POST", json: { id: editId ?? undefined, title, content } });
    setTab("list");
    setTitle("");
    setContent("");
    setEditId(null);
    await load();
  }

  return (
    <Modal open={open} onClose={onClose} title="Knowledge Base" wide>
      <div className="mb-4 flex gap-2">
        <Button variant={tab === "list" ? "primary" : "ghost"} onClick={() => setTab("list")}>Documents</Button>
        <Button variant={tab === "edit" ? "primary" : "ghost"} onClick={() => { setTab("edit"); setEditId(null); setTitle(""); setContent(""); }}>Add</Button>
      </div>
      {tab === "list" ? (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="rounded-xl border border-[#243044] bg-[#0f1520] p-3">
              <div className="flex justify-between">
                <button className="text-left font-medium text-cyan-300" onClick={() => { setEditId(d.id); setTitle(d.title); setContent(d.content); setTab("edit"); }}>{d.title}</button>
                <Button variant="danger" className="!text-xs" onClick={async () => { await api(`/api/knowledge-base/${d.id}`, { method: "DELETE" }); await load(); }}>Delete</Button>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-[#6b7c93]">{d.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <>
          <Input className="mb-2" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea className="min-h-[280px]" value={content} onChange={(e) => setContent(e.target.value)} />
          <div className="mt-4 flex justify-end"><Button variant="success" onClick={save}>Save</Button></div>
        </>
      )}
    </Modal>
  );
}

function ListsModal({
  open,
  onClose,
  patients,
  onSelectPatient,
}: {
  open: boolean;
  onClose: () => void;
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
    if (open) { setDetail(null); load().catch(() => undefined); }
  }, [open, load]);

  if (detail) {
    return (
      <Modal open={open} onClose={onClose} title={detail.name} wide>
        <div className="mb-4 flex gap-2">
          <select className="flex-1 rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2 text-sm" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">Add patient...</option>
            {patients.filter((p) => !detail.patients.some((dp) => dp.id === p.id)).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Button variant="success" onClick={async () => {
            if (!patientId) return;
            await api(`/api/lists/${detail.id}`, { method: "POST", json: { patientId } });
            const data = await api<{ lists: PatientList[] }>("/api/lists");
            setDetail(data.lists.find((l) => l.id === detail.id) ?? null);
            setPatientId("");
          }}>Add</Button>
          <Button onClick={() => setDetail(null)}>Back</Button>
        </div>
        <div className="space-y-2">
          {detail.patients.map((p) => (
            <div key={p.id} className="flex justify-between rounded-xl border border-[#243044] bg-[#0f1520] px-4 py-2">
              <button onClick={() => { const pt = patients.find((x) => x.id === p.id); if (pt) onSelectPatient(pt); onClose(); }}>{p.name}</button>
              <Button variant="danger" className="!text-xs" onClick={async () => {
                await api(`/api/lists/${detail.id}/patients/${p.id}`, { method: "DELETE" });
                const data = await api<{ lists: PatientList[] }>("/api/lists");
                setDetail(data.lists.find((l) => l.id === detail.id) ?? null);
              }}>Remove</Button>
            </div>
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Patient Lists" wide>
      <div className="mb-4 flex gap-2">
        <Input placeholder="New list name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="success" onClick={async () => {
          if (!name.trim()) return;
          await api("/api/lists", { method: "POST", json: { name } });
          setName("");
          await load();
        }}>Create</Button>
      </div>
      <div className="space-y-2">
        {lists.map((l) => (
          <button key={l.id} onClick={() => setDetail(l)} className="flex w-full items-center justify-between rounded-xl border border-[#243044] bg-[#0f1520] px-4 py-3 text-left hover:bg-[#1a2330]">
            <div>
              <div className="font-medium">{l.name}</div>
              <div className="text-xs text-[#6b7c93]">{l.patients.length} patients</div>
            </div>
            <span>→</span>
          </button>
        ))}
      </div>
    </Modal>
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
