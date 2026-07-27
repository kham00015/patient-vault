"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { Shield, KeyRound } from "lucide-react";

function ChangePasswordForm({ onComplete }: { onComplete: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        json: { currentPassword, newPassword },
      });
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Input
        type="password"
        placeholder="Current password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        autoComplete="current-password"
      />
      <Input
        type="password"
        placeholder={`New password (min ${PASSWORD_MIN_LENGTH} chars)`}
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        autoComplete="new-password"
      />
      <Input
        type="password"
        placeholder="Confirm new password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        autoComplete="new-password"
      />
      <p className="text-xs text-[var(--pv-muted)]">
        Use at least {PASSWORD_MIN_LENGTH} characters with uppercase, lowercase, a number, and a special character.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button variant="success" className="w-full" disabled={loading} onClick={submit}>
        {loading ? "Saving..." : "Update password"}
      </Button>
    </div>
  );
}

export function ChangePasswordModal({
  open,
  forced,
  onComplete,
}: {
  open: boolean;
  forced?: boolean;
  onComplete: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await api("/api/auth/change-password", {
        method: forced ? "PATCH" : "POST",
        json: { currentPassword, newPassword },
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={forced ? () => undefined : onComplete}
      title={forced ? "Change your password" : "Change password"}
    >
      <div className="space-y-3">
        {forced && (
          <p className="text-sm text-amber-300">
            Your administrator assigned a temporary password. Choose a new password before continuing.
          </p>
        )}
        <Input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
        <Input
          type="password"
          placeholder={`New password (min ${PASSWORD_MIN_LENGTH} chars)`}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
        />
        <Input
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
        <p className="text-xs text-[var(--pv-muted)]">
          Use at least {PASSWORD_MIN_LENGTH} characters with uppercase, lowercase, a number, and a special character.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button variant="success" className="w-full" disabled={loading} onClick={submit}>
          {loading ? "Saving..." : "Update password"}
        </Button>
      </div>
    </Modal>
  );
}

export function AccountSecurityModal({
  open,
  onClose,
  mfaEnabled,
  onMfaChange,
}: {
  open: boolean;
  onClose: () => void;
  mfaEnabled: boolean;
  onMfaChange: (enabled: boolean) => void;
}) {
  const [tab, setTab] = useState<"password" | "mfa">("password");

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function startMfaSetup() {
    setError("");
    setLoading(true);
    try {
      const data = await api<{ qrDataUrl: string; secret: string }>("/api/auth/mfa", { method: "POST" });
      setQrDataUrl(data.qrDataUrl);
      setSetupSecret(data.secret);
      setBackupCodes(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start MFA setup");
    } finally {
      setLoading(false);
    }
  }

  async function confirmMfaSetup() {
    setError("");
    setLoading(true);
    try {
      const data = await api<{ backupCodes: string[] }>("/api/auth/mfa", {
        method: "PUT",
        json: { code: verifyCode },
      });
      setBackupCodes(data.backupCodes);
      setQrDataUrl(null);
      setSetupSecret("");
      setVerifyCode("");
      onMfaChange(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid code");
    } finally {
      setLoading(false);
    }
  }

  async function disableMfa() {
    setError("");
    setLoading(true);
    try {
      await api("/api/auth/mfa", {
        method: "DELETE",
        json: { password: disablePassword, code: disableCode },
      });
      setDisablePassword("");
      setDisableCode("");
      onMfaChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disable MFA");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setTab("password");
    setQrDataUrl(null);
    setSetupSecret("");
    setVerifyCode("");
    setBackupCodes(null);
    setError("");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Account security" wide>
      <div className="mb-4 flex gap-2">
        <Button
          variant={tab === "password" ? "primary" : "ghost"}
          className="gap-2"
          onClick={() => setTab("password")}
        >
          <KeyRound size={16} /> Password
        </Button>
        <Button variant={tab === "mfa" ? "primary" : "ghost"} className="gap-2" onClick={() => setTab("mfa")}>
          <Shield size={16} /> Two-factor (MFA)
        </Button>
      </div>

      {tab === "password" && <ChangePasswordForm onComplete={handleClose} />}

      {tab === "mfa" && (
        <div className="space-y-3 text-sm">
          {mfaEnabled && !qrDataUrl && !backupCodes && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300">
              MFA is enabled on your account.
            </div>
          )}

          {!mfaEnabled && !qrDataUrl && (
            <div>
              <p className="mb-3 text-[var(--pv-muted-2)]">
                Add an authenticator app (Google Authenticator, Authy, 1Password, etc.) for an extra layer of security.
              </p>
              <Button variant="success" disabled={loading} onClick={startMfaSetup}>
                Set up MFA
              </Button>
            </div>
          )}

          {qrDataUrl && (
            <div className="space-y-3">
              <p className="text-[var(--pv-muted-2)]">Scan this QR code with your authenticator app:</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="MFA QR code" className="mx-auto h-48 w-48 rounded-lg bg-white p-2" />
              {setupSecret && (
                <p className="break-all font-mono text-xs text-[var(--pv-muted)]">Manual key: {setupSecret}</p>
              )}
              <Input
                placeholder="6-digit code from app"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
              />
              <Button variant="success" disabled={loading} onClick={confirmMfaSetup}>
                Verify and enable MFA
              </Button>
            </div>
          )}

          {backupCodes && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="mb-2 font-medium text-amber-200">Save these backup codes somewhere safe:</p>
              <div className="grid grid-cols-2 gap-1 font-mono text-xs text-amber-100">
                {backupCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <p className="mt-2 text-xs text-[var(--pv-muted-2)]">Each code works once if you lose your authenticator.</p>
            </div>
          )}

          {mfaEnabled && (
            <div className="mt-4 border-t border-[var(--pv-border)] pt-4">
              <p className="mb-2 text-[var(--pv-muted-2)]">Disable MFA (requires password and current code)</p>
              <Input
                type="password"
                placeholder="Your password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />
              <Input
                className="mt-2"
                placeholder="Authenticator or backup code"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
              />
              <Button variant="ghost" className="mt-2 text-red-400" disabled={loading} onClick={disableMfa}>
                Disable MFA
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
