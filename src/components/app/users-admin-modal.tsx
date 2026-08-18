"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { generateTemporaryPassword, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { formatDate } from "@/lib/utils";
import { Lock, RefreshCw, UserPlus } from "lucide-react";

type ManagedUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  isLocked: boolean;
  lockedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  officeName?: string | null;
};

type OfficeOption = { id: string; code: string; name: string };

const ROLES = ["ADMIN", "CLINICIAN", "STAFF", "READONLY", "CONSULTANT"] as const;

export function UsersAdminModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createRole, setCreateRole] = useState<(typeof ROLES)[number]>("CLINICIAN");
  const [createPassword, setCreatePassword] = useState("");
  const [offices, setOffices] = useState<OfficeOption[]>([]);
  const [canAssignOffice, setCanAssignOffice] = useState(false);
  const [listOfficeId, setListOfficeId] = useState("");
  const [createOfficeId, setCreateOfficeId] = useState("");

  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");

  async function loadUsers(officeId = listOfficeId) {
    setLoading(true);
    setError("");
    try {
      const qs = officeId ? `?officeId=${encodeURIComponent(officeId)}` : "";
      const data = await api<{ users: ManagedUser[] }>(`/api/users${qs}`);
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }

  async function loadOffices() {
    try {
      const data = await api<{
        offices: OfficeOption[];
        canAssignOffice: boolean;
        currentOfficeId: string | null;
      }>("/api/offices");
      setOffices(data.offices);
      setCanAssignOffice(data.canAssignOffice);
      const current = data.currentOfficeId || data.offices[0]?.id || "";
      setListOfficeId((prev) => prev || current);
      setCreateOfficeId((prev) => prev || current);
      return current;
    } catch {
      return "";
    }
  }

  useEffect(() => {
    if (open) {
      loadOffices()
        .then((officeId) => loadUsers(officeId))
        .catch(() => undefined);
      setShowCreate(false);
      setResetUserId(null);
      setSuccess("");
      setError("");
    }
  }, [open]);

  async function createUser() {
    setError("");
    setSuccess("");
    try {
      await api("/api/users", {
        method: "POST",
        json: {
          email: createEmail.trim(),
          name: createName.trim(),
          role: createRole,
          password: createPassword,
          ...(canAssignOffice && createOfficeId ? { officeId: createOfficeId } : {}),
        },
      });
      const clinic = offices.find((o) => o.id === createOfficeId)?.name;
      setSuccess(
        `User ${createEmail.trim()} created${clinic ? ` in ${clinic}` : ""}. They must change password on first login.`
      );
      setShowCreate(false);
      setCreateEmail("");
      setCreateName("");
      setCreatePassword("");
      if (createOfficeId) setListOfficeId(createOfficeId);
      await loadUsers(createOfficeId || listOfficeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create user");
    }
  }

  async function submitPasswordReset(userId: string) {
    setError("");
    setSuccess("");
    try {
      await api(`/api/users/${userId}/reset-password`, {
        method: "POST",
        json: { password: resetPasswordValue },
      });
      setSuccess("Password reset and account unlocked. Share the new password securely with the user.");
      setResetUserId(null);
      setResetPasswordValue("");
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset password");
    }
  }

  async function unlockUser(userId: string) {
    setError("");
    setSuccess("");
    try {
      await api(`/api/users/${userId}/unlock`, { method: "POST" });
      setSuccess("Account unlocked.");
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unlock account");
    }
  }

  async function toggleActive(user: ManagedUser) {
    setError("");
    try {
      await api(`/api/users/${user.id}`, {
        method: "PATCH",
        json: { isActive: !user.isActive },
      });
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update user");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="User Administration" wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[var(--pv-muted-2)]">
            Create accounts, reset passwords, and unlock accounts after failed logins.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {canAssignOffice && offices.length > 0 && (
              <select
                className="rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 py-2 text-sm text-white"
                value={listOfficeId}
                onChange={(e) => {
                  const next = e.target.value;
                  setListOfficeId(next);
                  loadUsers(next).catch(() => undefined);
                }}
              >
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <Button variant="primary" className="gap-2" onClick={() => setShowCreate((v) => !v)}>
              <UserPlus size={16} /> New user
            </Button>
          </div>
        </div>

        {showCreate && (
          <div className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-cyan-300">Create user</h3>
            <div className="grid gap-2 md:grid-cols-2">
              <Input placeholder="Email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} />
              <Input placeholder="Full name" value={createName} onChange={(e) => setCreateName(e.target.value)} />
              <select
                className="rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 py-2.5 text-sm text-white"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as (typeof ROLES)[number])}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {canAssignOffice && offices.length > 0 && (
                <select
                  className="rounded-lg border border-[var(--pv-border-strong)] bg-[var(--pv-input)] px-3 py-2.5 text-sm text-white"
                  value={createOfficeId}
                  onChange={(e) => setCreateOfficeId(e.target.value)}
                >
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder={`Initial password (min ${PASSWORD_MIN_LENGTH})`}
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                />
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setCreatePassword(generateTemporaryPassword())}
                  title="Generate password"
                >
                  <RefreshCw size={16} />
                </Button>
              </div>
            </div>
            <p className="text-xs text-[var(--pv-muted)]">
              User must change this password on first login. Password needs upper, lower, number, and special character.
            </p>
            <Button variant="success" onClick={createUser}>
              Create user
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-emerald-400">{success}</p>}

        {loading ? (
          <p className="text-sm text-[var(--pv-muted-2)]">Loading users...</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] p-3 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-white">{u.name ?? "—"}</p>
                    <p className="text-[var(--pv-muted-2)]">{u.email}</p>
                    <p className="mt-1 text-[var(--pv-muted)]">
                      {u.role}
                      {u.officeName ? ` · ${u.officeName}` : ""}
                      {!u.isActive && " · Disabled"}
                      {u.mfaEnabled && " · MFA on"}
                      {u.mustChangePassword && " · Must change password"}
                      {u.isLocked && (
                        <span className="text-red-400">
                          {" "}
                          · Locked ({u.failedLoginAttempts} failed attempts)
                        </span>
                      )}
                    </p>
                    {u.lastLoginAt && (
                      <p className="text-[var(--pv-muted)]">Last login: {formatDate(u.lastLoginAt)}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {u.isLocked && (
                      <Button variant="ghost" className="!text-xs" onClick={() => unlockUser(u.id)}>
                        Unlock
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="!text-xs gap-1"
                      onClick={() => {
                        setResetUserId(u.id);
                        setResetPasswordValue(generateTemporaryPassword());
                      }}
                    >
                      <Lock size={14} /> Reset password
                    </Button>
                    <Button variant="ghost" className="!text-xs" onClick={() => toggleActive(u)}>
                      {u.isActive ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </div>

                {resetUserId === u.id && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--pv-border)] pt-3">
                    <Input
                      className="max-w-md"
                      value={resetPasswordValue}
                      onChange={(e) => setResetPasswordValue(e.target.value)}
                      placeholder="New temporary password"
                    />
                    <Button variant="ghost" onClick={() => setResetPasswordValue(generateTemporaryPassword())}>
                      <RefreshCw size={14} />
                    </Button>
                    <Button variant="success" className="!text-xs" onClick={() => submitPasswordReset(u.id)}>
                      Confirm reset
                    </Button>
                    <Button variant="ghost" className="!text-xs" onClick={() => setResetUserId(null)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
