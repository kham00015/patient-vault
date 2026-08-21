"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";
import { Shield, Stethoscope } from "lucide-react";

type LoginResponse = {
  user?: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    mustChangePassword?: boolean;
    mfaEnabled?: boolean;
  };
  mfaRequired?: boolean;
  mfaToken?: string;
  mustChangePassword?: boolean;
  error?: string;
  locked?: boolean;
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("reason");
    if (reason === "idle") {
      setError("Signed out after 5 minutes of inactivity.");
    } else if (reason === "expired") {
      setError("Your session expired. Please sign in again.");
    }
  }, []);

  async function parseLoginResponse(res: Response): Promise<LoginResponse> {
    const data = (await res.json().catch(() => ({}))) as LoginResponse & { error?: string };
    if (!res.ok) {
      throw new Error(data.error ?? `Login failed (${res.status})`);
    }
    return data;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      const data = await parseLoginResponse(res);

      if (data.mfaRequired && data.mfaToken) {
        setMfaToken(data.mfaToken);
        return;
      }

      window.location.href = "/app";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/mfa/verify-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mfaToken, code: mfaCode }),
        credentials: "include",
      });
      await parseLoginResponse(res);
      window.location.href = "/app";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 ring-1 ring-cyan-500/30">
            <Stethoscope className="text-cyan-400" size={28} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{APP_NAME}</h1>
          <p className="mt-2 text-sm text-[var(--pv-muted-2)]">{APP_TAGLINE}</p>
        </div>

        {!mfaToken ? (
          <form
            onSubmit={handleLogin}
            className="rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-card)]/90 p-6 shadow-xl backdrop-blur"
          >
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <Input
              className="mt-3"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
            <Button type="submit" variant="primary" className="mt-4 w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={handleMfaVerify}
            className="rounded-2xl border border-[var(--pv-border)] bg-[var(--pv-card)]/90 p-6 shadow-xl backdrop-blur"
          >
            <p className="mb-3 text-sm text-[var(--pv-muted-2)]">
              Enter the 6-digit code from your authenticator app.
            </p>
            <Input
              placeholder="Authentication code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              autoComplete="one-time-code"
              required
            />
            {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
            <Button type="submit" variant="primary" className="mt-4 w-full" disabled={loading}>
              {loading ? "Verifying..." : "Verify"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => {
                setMfaToken(null);
                setMfaCode("");
                setError("");
              }}
            >
              Back to sign in
            </Button>
          </form>
        )}

        <div className="mt-6 flex items-start gap-2 rounded-xl border border-[var(--pv-border)] bg-[var(--pv-panel)] p-4 text-xs text-[var(--pv-muted-2)]">
          <Shield size={16} className="mt-0.5 shrink-0 text-cyan-500" />
          <p>
            Accounts lock after 5 failed sign-in attempts. Contact your clinic administrator to reset your password.
          </p>
        </div>
      </div>
    </div>
  );
}
