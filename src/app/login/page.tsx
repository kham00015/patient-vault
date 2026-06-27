"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { APP_TAGLINE, CLINIC_NAME } from "@/lib/branding";
import { Shield, Stethoscope } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/auth/login", { method: "POST", json: { email, password } });
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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
          <h1 className="text-2xl font-bold tracking-tight">{CLINIC_NAME}</h1>
          <p className="mt-2 text-sm text-[#8b9cb3]">{APP_TAGLINE}</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="rounded-2xl border border-[#243044] bg-[#121820]/90 p-6 shadow-xl backdrop-blur"
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

        <div className="mt-6 space-y-3">
          <div className="rounded-xl border border-[#243044] bg-[#0f1520] p-4 text-xs text-[#8b9cb3]">
            <p className="mb-2 font-medium text-cyan-300">Development logins</p>
            <div className="space-y-2 font-mono text-[11px]">
              <div>
                <span className="text-[#6b7c93]">Admin</span>
                <div>admin@clinic.local</div>
              </div>
              <div>
                <span className="text-[#6b7c93]">User (staff view)</span>
                <div>user@clinic.local</div>
              </div>
              <div className="text-[#6b7c93]">Password: ChangeMe123!</div>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-[#243044] bg-[#0f1520] p-4 text-xs text-[#8b9cb3]">
            <Shield size={16} className="mt-0.5 shrink-0 text-cyan-500" />
            <p>
              Development build. Production requires signed BAAs, encrypted hosting, MFA, and a formal HIPAA risk assessment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
