"use client";

import { useCallback, useEffect, useState } from "react";
import type { SessionUser } from "@/lib/roles";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  MESSAGE_CATEGORIES,
  MESSAGE_PRIORITIES,
  getMessageCategoryLabel,
  getMessagePriorityLabel,
  type MessageCategory,
  type MessagePriority,
} from "@/lib/messages";
import { formatDisplayName } from "@/lib/patient-registration";
import { cn, formatDate } from "@/lib/utils";
import { AlertCircle, Inbox, MailPlus, Send } from "lucide-react";

function userCanSendMessages(role: SessionUser["role"]) {
  return role === "ADMIN" || role === "CLINICIAN" || role === "STAFF";
}

type PatientOption = { id: string; name: string };
type StaffOption = { id: string; name: string | null; email: string; role: string };

type ThreadSummary = {
  id: string;
  subject: string;
  patientId: string | null;
  patientName: string | null;
  priority: string;
  category: string;
  unread: boolean;
  lastMessagePreview: string;
  lastMessageAt: string;
  otherParticipantName: string | null;
};

type ThreadDetail = ThreadSummary & {
  messages: {
    id: string;
    body: string;
    createdAt: string;
    senderName: string;
    isMine: boolean;
  }[];
};

export function MessagingPanel({
  user,
  patients,
  onSelectPatient,
  onUnreadChange,
}: {
  user: SessionUser;
  patients: PatientOption[];
  onSelectPatient: (p: PatientOption) => void;
  onUnreadChange?: (count: number) => void;
}) {
  const canSend = userCanSendMessages(user.role);
  const [folder, setFolder] = useState<"inbox" | "sent">("inbox");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeThread, setActiveThread] = useState<ThreadDetail | null>(null);
  const [composing, setComposing] = useState(false);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState("");

  const [recipientId, setRecipientId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [patientId, setPatientId] = useState("");
  const [priority, setPriority] = useState<MessagePriority>("ROUTINE");
  const [category, setCategory] = useState<MessageCategory>("GENERAL");

  const refreshUnread = useCallback(async () => {
    const data = await api<{ unread: number }>("/api/messages/unread");
    onUnreadChange?.(data.unread);
  }, [onUnreadChange]);

  const loadThreads = useCallback(async () => {
    const data = await api<{ threads: ThreadSummary[] }>(`/api/messages?folder=${folder}`);
    setThreads(data.threads);
  }, [folder]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadThreads(), refreshUnread()])
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [loadThreads, refreshUnread]);

  useEffect(() => {
    if (composing && staff.length === 0) {
      api<{ staff: StaffOption[] }>("/api/messages/staff")
        .then((d) => setStaff(d.staff))
        .catch(() => undefined);
    }
  }, [composing, staff.length]);

  async function openThread(threadId: string) {
    const data = await api<{ thread: ThreadDetail }>(`/api/messages/threads/${threadId}`);
    setActiveThread(data.thread);
    setComposing(false);
    setReplyBody("");
    if (data.thread.unread) {
      await api(`/api/messages/threads/${threadId}`, { method: "PATCH" });
      await loadThreads();
      await refreshUnread();
      setActiveThread({ ...data.thread, unread: false });
    }
  }

  async function sendNewMessage() {
    if (!recipientId || !subject.trim() || !body.trim()) return;
    const res = await api<{ thread: ThreadSummary }>("/api/messages", {
      method: "POST",
      json: {
        recipientId,
        subject,
        body,
        patientId: patientId || undefined,
        priority,
        category,
      },
    });
    setComposing(false);
    setRecipientId("");
    setSubject("");
    setBody("");
    setPatientId("");
    setPriority("ROUTINE");
    setCategory("GENERAL");
    setFolder("inbox");
    await loadThreads();
    await refreshUnread();
    await openThread(res.thread.id);
  }

  async function sendReply() {
    if (!activeThread || !replyBody.trim()) return;
    const data = await api<{ thread: ThreadDetail }>(
      `/api/messages/threads/${activeThread.id}`,
      { method: "POST", json: { body: replyBody } }
    );
    setReplyBody("");
    setActiveThread(data.thread);
    await loadThreads();
    await refreshUnread();
  }

  if (composing) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium text-cyan-200">New Message</h2>
          <Button className="!text-xs" onClick={() => setComposing(false)}>
            Cancel
          </Button>
        </div>
        <p className="mb-4 text-xs text-[#6b7c93]">
          Secure internal staff messaging — link a patient when the message is chart-related.
        </p>
        <div className="grid max-w-2xl gap-3">
          <label className="block text-xs text-[#6b7c93]">
            To
            <select
              className="mt-1 w-full rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2 text-sm"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
            >
              <option value="">Select staff member...</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.email} ({s.role.toLowerCase()})
                </option>
              ))}
            </select>
          </label>
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-[#6b7c93]">
              Category
              <select
                className="mt-1 w-full rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value as MessageCategory)}
              >
                {MESSAGE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-[#6b7c93]">
              Priority
              <select
                className="mt-1 w-full rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2 text-sm"
                value={priority}
                onChange={(e) => setPriority(e.target.value as MessagePriority)}
              >
                {MESSAGE_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs text-[#6b7c93]">
            Link patient (optional)
            <select
              className="mt-1 w-full rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2 text-sm"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              <option value="">No patient linked</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatDisplayName(p)}
                </option>
              ))}
            </select>
          </label>
          <Textarea
            className="min-h-[160px]"
            placeholder="Message..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex justify-end">
            <Button variant="success" onClick={sendNewMessage} disabled={!canSend}>
              <Send size={14} /> Send
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (activeThread) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[#243044] pb-3">
          <Button className="!text-xs" onClick={() => setActiveThread(null)}>
            ← Back
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-medium text-cyan-200">{activeThread.subject}</h2>
            <p className="text-xs text-[#6b7c93]">
              {getMessageCategoryLabel(activeThread.category)} ·{" "}
              {getMessagePriorityLabel(activeThread.priority)}
              {activeThread.otherParticipantName && ` · with ${activeThread.otherParticipantName}`}
            </p>
          </div>
          {activeThread.patientId && activeThread.patientName && (
            <Button
              className="!text-xs"
              onClick={() => {
                const p = patients.find((x) => x.id === activeThread.patientId);
                if (p) onSelectPatient(p);
              }}
            >
              Open Patient Chart
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {activeThread.messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-xl border px-3 py-2",
                m.isMine
                  ? "ml-auto border-cyan-500/30 bg-cyan-500/10"
                  : "border-[#243044] bg-[#0f1520]"
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-[#6b7c93]">
                <span>{m.senderName}</span>
                <span>{formatDate(m.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-[#d1d9e6]">{m.body}</p>
            </div>
          ))}
        </div>
        {canSend ? (
          <div className="mt-3 flex gap-2 border-t border-[#243044] pt-3">
            <Textarea
              className="min-h-[72px] flex-1"
              placeholder="Reply..."
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
            />
            <Button variant="success" className="self-end" onClick={sendReply}>
              <Send size={14} />
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-[#6b7c93]">Read-only — you cannot reply.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant={folder === "inbox" ? "primary" : "ghost"}
          className="!text-xs"
          onClick={() => setFolder("inbox")}
        >
          <Inbox size={14} /> Inbox
        </Button>
        <Button
          variant={folder === "sent" ? "primary" : "ghost"}
          className="!text-xs"
          onClick={() => setFolder("sent")}
        >
          <Send size={14} /> Sent
        </Button>
        {canSend && (
          <Button variant="success" className="!ml-auto !text-xs" onClick={() => setComposing(true)}>
            <MailPlus size={14} /> Compose
          </Button>
        )}
      </div>

      <p className="mb-4 text-xs text-[#6b7c93]">
        Internal staff inbox for refills, callbacks, lab results, referrals, and chart questions.
        Patient portal messaging can be added later.
      </p>

      {loading && <p className="text-sm text-[#6b7c93]">Loading messages...</p>}

      {!loading && threads.length === 0 && (
        <p className="rounded-xl border border-dashed border-[#243044] px-4 py-8 text-center text-sm text-[#6b7c93]">
          No messages in {folder}.
        </p>
      )}

      <div className="space-y-2">
        {threads.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => openThread(t.id)}
            className={cn(
              "w-full rounded-xl border px-4 py-3 text-left transition hover:bg-[#1a2330]",
              t.unread ? "border-cyan-500/40 bg-cyan-500/5" : "border-[#243044] bg-[#0f1520]"
            )}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {t.unread && (
                    <span className="rounded-full bg-cyan-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      New
                    </span>
                  )}
                  {t.priority === "URGENT" && (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold uppercase text-rose-400">
                      <AlertCircle size={11} /> Urgent
                    </span>
                  )}
                  <span className={cn("font-medium", t.unread ? "text-cyan-100" : "text-cyan-200")}>
                    {t.subject}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[#6b7c93]">
                  {getMessageCategoryLabel(t.category)}
                  {t.patientName && ` · ${t.patientName}`}
                  {t.otherParticipantName && folder === "inbox" && ` · from ${t.otherParticipantName}`}
                  {t.otherParticipantName && folder === "sent" && ` · to ${t.otherParticipantName}`}
                </p>
                <p className="mt-1 line-clamp-1 text-xs text-[#8b9cb3]">{t.lastMessagePreview}</p>
              </div>
              <span className="shrink-0 text-[10px] text-[#6b7c93]">{formatDate(t.lastMessageAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
