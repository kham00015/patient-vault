import type { MessageThread, ThreadMessage, ThreadParticipant, User, Patient } from "@prisma/client";

export type ThreadSummary = {
  id: string;
  subject: string;
  patientId: string | null;
  patientName: string | null;
  priority: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  unread: boolean;
  lastMessagePreview: string;
  lastMessageAt: string;
  otherParticipantName: string | null;
  isSentFolder: boolean;
};

export type ThreadDetail = ThreadSummary & {
  messages: {
    id: string;
    body: string;
    createdAt: string;
    senderId: string;
    senderName: string;
    isMine: boolean;
  }[];
};

type ThreadWithRelations = MessageThread & {
  patient: Pick<Patient, "id" | "name"> | null;
  createdBy: Pick<User, "id" | "name" | "email">;
  messages: (ThreadMessage & { sender: Pick<User, "id" | "name" | "email"> })[];
  participants: (ThreadParticipant & { user: Pick<User, "id" | "name" | "email"> })[];
};

export function toThreadSummary(
  thread: ThreadWithRelations,
  userId: string,
  folder: "inbox" | "sent"
): ThreadSummary {
  const lastMessage = thread.messages[thread.messages.length - 1];
  const myParticipant = thread.participants.find((p) => p.userId === userId);
  const otherParticipant = thread.participants.find((p) => p.userId !== userId);

  const unread =
    !!lastMessage &&
    lastMessage.senderId !== userId &&
    (!myParticipant?.lastReadAt || lastMessage.createdAt > myParticipant.lastReadAt);

  return {
    id: thread.id,
    subject: thread.subject,
    patientId: thread.patientId,
    patientName: thread.patient?.name ?? null,
    priority: thread.priority,
    category: thread.category,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    unread,
    lastMessagePreview: lastMessage?.body.slice(0, 120) ?? "",
    lastMessageAt: (lastMessage?.createdAt ?? thread.updatedAt).toISOString(),
    otherParticipantName:
      otherParticipant?.user.name ?? otherParticipant?.user.email ?? null,
    isSentFolder: folder === "sent",
  };
}

export function toThreadDetail(thread: ThreadWithRelations, userId: string): ThreadDetail {
  const summary = toThreadSummary(thread, userId, "inbox");
  return {
    ...summary,
    messages: thread.messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      senderId: m.senderId,
      senderName: m.sender.name ?? m.sender.email,
      isMine: m.senderId === userId,
    })),
  };
}

export const threadInclude = {
  patient: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: { sender: { select: { id: true, name: true, email: true } } },
  },
  participants: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
};
