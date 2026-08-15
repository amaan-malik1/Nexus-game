import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAdminAuth } from "../hooks/useAuth";
import { toast } from "../components/Toast";
import { GlitchLabel, GlitchText } from "../components/GlitchText";
import { Scanlines } from "../components/Scanlines";

export default function AdminLogin() {
  const nav = useNavigate();
  const { login, register, isAuthed } = useAdminAuth();
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAuthed) nav("/admin", { replace: true });
    api
      .get("/api/auth/admin/bootstrap-status")
      .then((r) => setNeedsBootstrap(r.data.needsBootstrap))
      .catch(() => void 0);
  }, [isAuthed, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (needsBootstrap) await register(email, password);
      else await login(email, password);
      toast("Access granted", "success");
      nav("/admin", { replace: true });
    } catch (err: any) {
      toast(err.response?.data?.error?.formErrors?.[0] ?? err.response?.data?.error ?? "Login failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen nx-grid-bg flex items-center justify-center p-6">
      <Scanlines />
      <div className="nx-card nx-card-cyan p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <GlitchLabel className="text-3xl">NEXUS</GlitchLabel>
          <div className="text-nx-muted nx-mono text-xs mt-2">
            <GlitchText text={needsBootstrap ? "> INITIALIZE ADMIN NODE" : "> ADMIN AUTHENTICATION"} />
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-nx-muted mb-1 nx-mono">EMAIL</label>
            <input
              className="nx-input w-full" type="email" required autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-nx-muted mb-1 nx-mono">PASSWORD</label>
            <input
              className="nx-input w-full" type="password" required autoComplete="current-password" minLength={6}
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="nx-btn nx-btn-solid w-full" disabled={busy}>
            {busy ? "…" : needsBootstrap ? "Create Admin" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
