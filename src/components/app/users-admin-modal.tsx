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
};

const ROLES = ["ADMIN", "CLINICIAN", "STAFF", "READONLY"] as const;

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

  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ users: ManagedUser[] }>("/api/users");
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      loadUsers().catch(() => undefined);
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
        },
      });
      setSuccess(`User ${createEmail.trim()} created. They must change password on first login.`);
      setShowCreate(false);
      setCreateEmail("");
      setCreateName("");
      setCreatePassword("");
      await loadUsers();
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
          <p className="text-sm text-[#8b9cb3]">
            Create accounts, reset passwords, and unlock accounts after failed logins.
          </p>
          <Button variant="primary" className="gap-2" onClick={() => setShowCreate((v) => !v)}>
            <UserPlus size={16} /> New user
          </Button>
        </div>

        {showCreate && (
          <div className="rounded-xl border border-[#243044] bg-[#0f1520] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-cyan-300">Create user</h3>
            <div className="grid gap-2 md:grid-cols-2">
              <Input placeholder="Email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} />
              <Input placeholder="Full name" value={createName} onChange={(e) => setCreateName(e.target.value)} />
              <select
                className="rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2.5 text-sm text-white"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as (typeof ROLES)[number])}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
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
            <p className="text-xs text-[#6b7c93]">
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
          <p className="text-sm text-[#8b9cb3]">Loading users...</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="rounded-xl border border-[#243044] bg-[#0f1520] p-3 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-white">{u.name ?? "—"}</p>
                    <p className="text-[#8b9cb3]">{u.email}</p>
                    <p className="mt-1 text-[#6b7c93]">
                      {u.role}
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
                      <p className="text-[#6b7c93]">Last login: {formatDate(u.lastLoginAt)}</p>
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
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[#243044] pt-3">
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
