import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { api, apiUrl } from "../lib/api";
import { useAdminAuth } from "../hooks/useAuth";
import { usePolling } from "../hooks/usePolling";
import { GlitchLabel } from "../components/GlitchText";
import { Modal } from "../components/Modal";
import { toast } from "../components/Toast";
import { formatTime, cx } from "../lib/format";

export default function AdminDashboard() {
  const { isAuthed, logout } = useAdminAuth();
  const nav = useNavigate();
  if (!isAuthed) return <Navigate to="/admin/login" replace />;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-nx-bg/95 backdrop-blur border-b border-nx-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
          <GlitchLabel className="text-lg">NEXUS · CONTROL</GlitchLabel>
          <nav className="flex gap-1 text-xs nx-mono">
            {[
              ["/admin/control", "GAME"],
              ["/admin/teams", "TEAMS"],
              ["/admin/missions", "MISSIONS"],
              ["/admin/leaderboard", "LEADERBOARD"],
              ["/admin/activity", "ACTIVITY"],
            ].map(([to, label]) => (
              <NavLink
                key={to} to={to}
                className={({ isActive }) =>
                  cx(
                    "px-3 py-2 rounded uppercase tracking-widest",
                    isActive ? "text-nx-cyan bg-nx-bg3" : "text-nx-muted hover:text-nx-text",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <button className="nx-btn nx-btn-ghost text-xs" onClick={() => { logout(); nav("/admin/login"); }}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        <Routes>
          <Route index element={<Navigate to="control" replace />} />
          <Route path="control" element={<GameControlTab />} />
          <Route path="teams" element={<TeamsTab />} />
          <Route path="missions" element={<MissionsTab />} />
          <Route path="leaderboard" element={<LeaderboardTab />} />
          <Route path="activity" element={<ActivityTab />} />
        </Routes>
      </main>
    </div>
  );
}

// ============ Game Control ============
function GameControlTab() {
  const game = usePolling<any>(() => api.get("/api/admin/game").then((r) => r.data), 3000);
  const [confirmReset, setConfirmReset] = useState(false);
  const [totalTime, setTotalTime] = useState<number>(1800);

  useEffect(() => {
    if (game.data?.totalTime) setTotalTime(game.data.totalTime);
  }, [game.data?.totalTime]);

  async function action(a: string) {
    try {
      await api.patch("/api/admin/game", { action: a });
      toast(`Game ${a}`, "success");
      game.refresh();
    } catch (e: any) {
      toast(e.response?.data?.error || "Failed", "error");
    }
  }
  async function saveTime() {
    try {
      await api.patch("/api/admin/game", { totalTime });
      toast("Duration saved", "success");
      game.refresh();
    } catch (e: any) {
      toast(e.response?.data?.error || "Failed", "error");
    }
  }
  async function reset() {
    try {
      await api.post("/api/admin/game/reset");
      toast("Game reset", "success");
      setConfirmReset(false);
      game.refresh();
    } catch (e: any) {
      toast(e.response?.data?.error || "Reset failed", "error");
    }
  }

  const status = game.data?.gameStatus ?? "NOT_STARTED";
  const remaining = game.data?.remaining ?? game.data?.totalTime ?? 0;
  const statusColor =
    status === "RUNNING" ? "text-nx-green"
  : status === "PAUSED" ? "text-nx-yellow"
  : status === "FINISHED" ? "text-nx-magenta"
  : "text-nx-muted";

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="nx-card p-6 md:col-span-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-nx-muted text-xs nx-mono">STATUS</div>
            <div className={cx("nx-display text-3xl", statusColor)}>{status.replace("_", " ")}</div>
          </div>
          <div className="text-right">
            <div className="text-nx-muted text-xs nx-mono">TIME LEFT</div>
            <div className="nx-display text-4xl text-nx-cyan nx-glow-cyan">{formatTime(remaining)}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {status === "NOT_STARTED" && (
            <button className="nx-btn nx-btn-solid" onClick={() => action("START")}>▶ Start</button>
          )}
          {status === "RUNNING" && (
            <>
              <button className="nx-btn" onClick={() => action("PAUSE")}>⏸ Pause</button>
              <button className="nx-btn nx-btn-danger" onClick={() => action("FINISH")}>■ Stop</button>
            </>
          )}
          {status === "PAUSED" && (
            <>
              <button className="nx-btn nx-btn-solid" onClick={() => action("RESUME")}>▶ Resume</button>
              <button className="nx-btn nx-btn-danger" onClick={() => action("FINISH")}>■ Stop</button>
            </>
          )}
          {status === "FINISHED" && (
            <div className="text-nx-muted nx-mono text-sm">Game over. Reset to run again.</div>
          )}
          <button className="nx-btn nx-btn-danger ml-auto" onClick={() => setConfirmReset(true)}>Reset Game</button>
        </div>

        <div className="mt-6 flex items-center gap-3 nx-mono text-sm">
          <label className="text-nx-muted">Duration (sec)</label>
          <input
            className="nx-input w-32" type="number" min={60} max={7200}
            value={totalTime} onChange={(e) => setTotalTime(Number(e.target.value))}
          />
          <button className="nx-btn" onClick={saveTime}>Save</button>
        </div>
      </div>

      <div className="nx-card p-6">
        <div className="text-nx-muted text-xs nx-mono">MASTER KEY</div>
        <div className="nx-display text-3xl tracking-[8px] text-nx-magenta nx-glow-mag mt-1">
          {game.data?.masterKey || "—"}
        </div>
        <div className="text-nx-muted nx-mono text-xs mt-4">
          Auto-derived from active-mission fragment values. Editing a challenge fragment recomputes this.
        </div>
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset game?">
        <div className="nx-mono text-sm text-nx-text">
          This wipes all team progress, fragments, scores, and activity. Teams and missions stay. This cannot be undone.
        </div>
        <div className="flex gap-2 mt-4 justify-end">
          <button className="nx-btn nx-btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
          <button className="nx-btn nx-btn-danger" onClick={reset}>Reset</button>
        </div>
      </Modal>
    </div>
  );
}

// ============ Teams ============
function TeamsTab() {
  const teams = usePolling<any[]>(() => api.get("/api/admin/teams").then((r) => r.data), 5000);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [bulkN, setBulkN] = useState<number>(15);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function createOne() {
    if (!name.trim()) return;
    try {
      await api.post("/api/admin/teams", { name });
      setName(""); setCreateOpen(false); teams.refresh();
    } catch (e: any) { toast(e.response?.data?.error || "Failed", "error"); }
  }
  async function bulk() {
    try {
      const { data } = await api.post("/api/admin/teams", { bulk: bulkN });
      toast(`Created ${data.created} teams`, "success");
      setCreateOpen(false); teams.refresh();
    } catch (e: any) { toast(e.response?.data?.error || "Failed", "error"); }
  }
  async function del(id: string) {
    if (!confirm("Delete this team?")) return;
    await api.delete(`/api/admin/teams/${id}`);
    teams.refresh();
  }
  async function adjust(id: string, delta: number) {
    await api.patch(`/api/admin/teams/${id}/score`, { delta });
    teams.refresh();
  }
  async function verifyFragment(id: string, missionOrder?: number) {
    try {
      await api.post(`/api/admin/teams/${id}/verify-fragment`, missionOrder ? { missionOrder } : {});
      toast(missionOrder ? `Fragment ${missionOrder} unlocked` : "Fragment unlocked", "success");
      teams.refresh();
    } catch (e: any) { toast(e.response?.data?.error || "Verify failed", "error"); }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button className="nx-btn nx-btn-solid" onClick={() => setCreateOpen(true)}>+ Create Team(s)</button>
        <a className="nx-btn" href={apiUrl("/api/public/qr-sheet")} target="_blank" rel="noreferrer">
          Print QR sheet
        </a>
        <button className="nx-btn nx-btn-ghost ml-auto" onClick={() => teams.refresh()}>Refresh</button>
      </div>

      <div className="nx-card overflow-x-auto">
        <table className="w-full text-sm nx-mono">
          <thead className="text-xs uppercase text-nx-muted">
            <tr className="border-b border-nx-border">
              <th className="p-3 text-left">Team</th>
              <th className="p-3 text-left">Code</th>
              <th className="p-3">QR</th>
              <th className="p-3">Mission</th>
              <th className="p-3">Fragments</th>
              <th className="p-3">Score</th>
              <th className="p-3">Hints</th>
              <th className="p-3">Vault</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(teams.data ?? []).flatMap((t) => [
              (
                <tr key={t.id} className="border-b border-nx-border/60 hover:bg-nx-bg3/40">
                  <td className="p-3 nx-display tracking-widest text-nx-cyan">{t.name}</td>
                  <td className="p-3 tracking-widest">{t.code}</td>
                  <td className="p-3 text-center">
                    <a
                      className="inline-block"
                      href={apiUrl(`/api/public/teams/${t.code}/qr`)}
                      target="_blank"
                      rel="noreferrer"
                      title="Open QR full-size"
                    >
                      <img
                        src={apiUrl(`/api/public/teams/${t.code}/qr`)}
                        alt={`QR for ${t.name}`}
                        className="w-14 h-14 rounded border border-nx-border hover:border-nx-cyan"
                      />
                    </a>
                  </td>
                  <td className="p-3 text-center">{t.currentMission > 5 ? "VAULT" : t.currentMission}</td>
                  <td className="p-3 text-center">{t.fragmentsCollected}/5</td>
                  <td className="p-3 text-center text-nx-green">{t.score}</td>
                  <td className="p-3 text-center">{t.hintsUsed}/2</td>
                  <td className="p-3 text-center">
                    {t.vaultUnlocked ? <span className="text-nx-magenta">BREACHED</span> : <span className="text-nx-muted">—</span>}
                  </td>
                  <td className="p-3 text-right">
                    <button className="text-nx-cyan text-xs underline mr-2"
                            onClick={() => setExpanded(expanded === t.id ? null : t.id)}>
                      {expanded === t.id ? "hide" : "details"}
                    </button>
                    <button className="text-nx-danger text-xs underline" onClick={() => del(t.id)}>del</button>
                  </td>
                </tr>
              ),
              expanded === t.id && (
                <tr key={`${t.id}-x`} className="bg-nx-bg2/50">
                    <td colSpan={9} className="p-4">
                      <div className="grid md:grid-cols-3 gap-4">
                        <div>
                          <div className="text-nx-muted text-xs mb-2 tracking-widest">MISSION PROGRESS</div>
                          <div className="space-y-1">
                            {(t.missions && t.missions.length > 0) ? (
                              t.missions.map((m: any) => (
                                <div key={m.orderIndex} className="flex justify-between text-xs items-baseline gap-2">
                                  <span className="truncate">{m.orderIndex}. {m.title}</span>
                                  <span className={cx(
                                    "shrink-0 tracking-widest",
                                    m.status === "COMPLETED" && "text-nx-green",
                                    m.status === "ACTIVE" && "text-nx-cyan",
                                    m.status === "AWAITING_FRAGMENT" && "text-nx-yellow",
                                    m.status === "LOCKED" && "text-nx-muted",
                                  )}>{m.status === "AWAITING_FRAGMENT" ? "AWAITING" : m.status}</span>
                                </div>
                              ))
                            ) : (
                              <div className="text-nx-muted text-xs italic">
                                Team hasn't started yet. Progress rows appear once the game is running.
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-nx-muted text-xs mb-2 tracking-widest">SCORE ADJUST</div>
                          <div className="flex gap-1.5 flex-wrap">
                            {[-50, -20, -10, +10, +20, +50].map((d) => (
                              <button key={d} className="nx-btn nx-btn-ghost !px-2.5 !py-1 text-xs" onClick={() => adjust(t.id, d)}>
                                {d > 0 ? `+${d}` : d}
                              </button>
                            ))}
                          </div>
                          <div className="text-nx-muted text-xs mt-4 mb-2">STAFF VERIFY</div>
                          <button className="nx-btn nx-btn-solid" onClick={() => verifyFragment(t.id)}>
                            Verify current fragment
                          </button>
                          <div className="text-nx-muted text-xs mt-1 mb-3">
                            Awards fragment for team's current mission and advances them.
                          </div>
                          <div className="text-nx-muted text-xs mb-1">FORCE UNLOCK BY MISSION</div>
                          <div className="flex gap-1 flex-wrap">
                            {[1,2,3,4,5].map((n) => (
                              <button
                                key={n}
                                className="nx-btn nx-btn-ghost !px-3 !py-1 text-xs"
                                onClick={() => verifyFragment(t.id, n)}
                                title={`Force unlock fragment ${n}`}
                              >M{n}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-nx-muted text-xs mb-2">FRAGMENTS COLLECTED</div>
                          <div className="flex gap-1">
                            {[1,2,3,4,5].map((o) => {
                              const f = t.fragments?.find((x: any) => x.missionOrder === o);
                              return (
                                <div key={o} className={cx("nx-fragment", !f && "empty")} style={{ width: 36, height: 44, fontSize: 18 }}>
                                  {f ? f.value : "·"}
                                </div>
                              );
                            })}
                          </div>
                          <div className="text-nx-muted text-xs mt-4 mb-2">JOIN URL</div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs break-all text-nx-cyan flex-1">{t.playUrl}</div>
                            <button
                              className="nx-btn nx-btn-ghost !px-3 !py-1 text-xs"
                              onClick={() => { navigator.clipboard.writeText(t.playUrl); toast("URL copied", "success"); }}
                            >Copy</button>
                          </div>
                          <div className="text-nx-muted text-xs mt-4 mb-2">SCAN TO PLAY</div>
                          <img
                            src={apiUrl(`/api/public/teams/${t.code}/qr`)}
                            alt={`QR for ${t.name}`}
                            className="w-56 h-56 bg-white p-2 rounded border border-nx-cyan"
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ),
            ].filter(Boolean))}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create teams">
        <div className="space-y-4 nx-mono text-sm">
          <div>
            <div className="text-nx-muted text-xs mb-1">Single team name</div>
            <div className="flex gap-2">
              <input className="nx-input flex-1" placeholder="CYBER PHANTOMS" value={name} onChange={(e) => setName(e.target.value.toUpperCase())}/>
              <button className="nx-btn nx-btn-solid" onClick={createOne}>Create</button>
            </div>
          </div>
          <div className="border-t border-nx-border pt-4">
            <div className="text-nx-muted text-xs mb-1">Bulk create (TEAM 01, TEAM 02, …)</div>
            <div className="flex gap-2">
              <input className="nx-input w-24" type="number" min={1} max={50} value={bulkN} onChange={(e) => setBulkN(Number(e.target.value))} />
              <button className="nx-btn" onClick={bulk}>Bulk create</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============ Missions ============
function MissionsTab() {
  const missions = usePolling<any[]>(() => api.get("/api/admin/missions").then((r) => r.data), 8000);
  const techTeam = usePolling<any[]>(() => api.get("/api/admin/tech-team").then((r) => r.data), 30000);
  const [editing, setEditing] = useState<any | null>(null);

  async function toggleActive(m: any) {
    await api.put(`/api/admin/missions/${m.id}`, { isActive: !m.isActive });
    missions.refresh();
  }
  async function saveAgent(m: any, patch: { agentMemberId?: string | null; agentClueText?: string }) {
    try {
      await api.put(`/api/admin/missions/${m.id}`, patch);
      toast("Mission updated", "success");
      missions.refresh();
    } catch (e: any) { toast(e.response?.data?.error || "Save failed", "error"); }
  }
  async function addChallenge(missionId: string) {
    const questionText = prompt("Question text?");
    if (!questionText) return;
    await api.post(`/api/admin/missions/${missionId}/challenges`, {
      questionText, questionData: {}, answer: "", points: 50,
    });
    missions.refresh();
  }
  async function delChallenge(id: string) {
    if (!confirm("Delete challenge?")) return;
    await api.delete(`/api/admin/challenges/${id}`);
    missions.refresh();
  }

  return (
    <div className="space-y-4">
      {(missions.data ?? []).filter((m) => m.orderIndex < 99).map((m) => (
        <MissionCard
          key={m.id}
          mission={m}
          techTeam={techTeam.data ?? []}
          onToggleActive={() => toggleActive(m)}
          onSaveAgent={(patch) => saveAgent(m, patch)}
          onEditChallenge={setEditing}
          onAddChallenge={() => addChallenge(m.id)}
          onDeleteChallenge={delChallenge}
        />
      ))}

      <ChallengeEditor
        challenge={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); missions.refresh(); }}
      />
    </div>
  );
}

function MissionCard({
  mission: m, techTeam, onToggleActive, onSaveAgent, onEditChallenge, onAddChallenge, onDeleteChallenge,
}: {
  mission: any;
  techTeam: any[];
  onToggleActive: () => void;
  onSaveAgent: (patch: { agentMemberId?: string | null; agentClueText?: string }) => void;
  onEditChallenge: (c: any) => void;
  onAddChallenge: () => void;
  onDeleteChallenge: (id: string) => void;
}) {
  const [clue, setClue] = useState(m.agentClueText ?? "");
  useEffect(() => { setClue(m.agentClueText ?? ""); }, [m.agentClueText]);

  const fragmentDigit = (() => {
    const c = [...(m.challenges ?? [])].reverse().find((c: any) => c.fragmentValue !== null && c.fragmentValue !== undefined);
    return c?.fragmentValue ?? null;
  })();

  return (
    <div className="nx-card p-4">
      <div className="flex items-center gap-3">
        <span className="nx-display text-xs text-nx-muted">M{String(m.orderIndex).padStart(2, "0")}</span>
        <span className="nx-display text-lg text-nx-cyan nx-glow-cyan">{m.title}</span>
        <span className="text-nx-muted text-xs nx-mono">{m.type}</span>
        {fragmentDigit !== null && (
          <span className="text-nx-magenta nx-display text-sm ml-2">FRAGMENT · {fragmentDigit}</span>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs nx-mono">
          <input type="checkbox" checked={m.isActive} onChange={onToggleActive} /> Active
        </label>
      </div>
      <div className="text-nx-muted text-xs nx-mono mt-2">{m.description}</div>

      {/* Agent assignment */}
      <div className="mt-4 grid md:grid-cols-2 gap-3 nx-mono text-sm">
        <div>
          <div className="text-nx-muted text-xs mb-1">ASSIGNED AGENT</div>
          <select
            className="nx-input w-full"
            value={m.agentMemberId ?? ""}
            onChange={(e) => onSaveAgent({ agentMemberId: e.target.value || null })}
          >
            <option value="">— none —</option>
            {techTeam.map((t) => (
              <option key={t.id} value={t.id}>
                {t.agentCallsign || t.role} — {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-nx-muted text-xs mb-1">CLUE TEXT (shown after puzzle)</div>
          <div className="flex gap-2">
            <input
              className="nx-input flex-1"
              value={clue}
              onChange={(e) => setClue(e.target.value)}
              placeholder="e.g. Find the CRYPTO AGENT near the labs…"
            />
            <button
              className="nx-btn nx-btn-ghost !px-3"
              disabled={clue === (m.agentClueText ?? "")}
              onClick={() => onSaveAgent({ agentClueText: clue })}
            >Save</button>
          </div>
        </div>
      </div>

      {/* Challenges */}
      <div className="mt-4 space-y-2">
        <div className="text-nx-muted text-xs">PUZZLE STEPS</div>
        {m.challenges.map((c: any, idx: number) => (
          <div key={c.id} className="border border-nx-border rounded p-3">
            <div className="flex items-center gap-2">
              <span className="text-nx-muted text-xs">#{idx + 1}</span>
              <span className="nx-mono text-sm flex-1">{c.questionText}</span>
              <span className="text-nx-cyan nx-mono text-xs">{c.points} pts</span>
              {c.fragmentValue !== null && c.fragmentValue !== undefined && (
                <span className="text-nx-magenta nx-display text-sm">frag {c.fragmentValue}</span>
              )}
              <button className="text-nx-cyan text-xs underline" onClick={() => onEditChallenge(c)}>edit</button>
              <button className="text-nx-danger text-xs underline" onClick={() => onDeleteChallenge(c.id)}>del</button>
            </div>
          </div>
        ))}
        <button className="nx-btn nx-btn-ghost" onClick={onAddChallenge}>+ Add challenge</button>
      </div>
    </div>
  );
}

function ChallengeEditor({
  challenge, onClose, onSaved,
}: { challenge: any | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    if (!challenge) return;
    setForm({
      questionText: challenge.questionText,
      questionDataJson: JSON.stringify(challenge.questionData, null, 2),
      answer: challenge.answer ?? "",
      fragmentValue: challenge.fragmentValue ?? "",
      points: challenge.points,
      hintText: challenge.hintText ?? "",
      hintCost: challenge.hintCost,
      orderInMission: challenge.orderInMission,
    });
  }, [challenge]);

  async function save() {
    let questionData: any = {};
    try { questionData = JSON.parse(form.questionDataJson || "{}"); }
    catch { toast("Invalid JSON in question data", "error"); return; }
    try {
      await api.put(`/api/admin/challenges/${challenge.id}`, {
        questionText: form.questionText,
        questionData,
        answer: form.answer === "" ? null : form.answer,
        fragmentValue: form.fragmentValue === "" ? null : Number(form.fragmentValue),
        points: Number(form.points),
        hintText: form.hintText || null,
        hintCost: Number(form.hintCost),
        orderInMission: Number(form.orderInMission),
      });
      toast("Challenge saved", "success");
      onSaved();
    } catch (e: any) { toast(e.response?.data?.error || "Save failed", "error"); }
  }

  if (!challenge || !form) return null;
  return (
    <Modal open={true} onClose={onClose} title="Edit challenge">
      <div className="space-y-3 nx-mono text-sm">
        <Field label="Question">
          <textarea className="nx-input w-full min-h-20" value={form.questionText} onChange={(e) => setForm({ ...form, questionText: e.target.value })}/>
        </Field>
        <Field label="Question data (JSON)">
          <textarea className="nx-input w-full min-h-32 font-mono text-xs" value={form.questionDataJson} onChange={(e) => setForm({ ...form, questionDataJson: e.target.value })}/>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Answer (empty = manual approval)">
            <input className="nx-input w-full" value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })}/>
          </Field>
          <Field label="Fragment (0-9, blank = none)">
            <input className="nx-input w-full" value={form.fragmentValue} onChange={(e) => setForm({ ...form, fragmentValue: e.target.value })}/>
          </Field>
          <Field label="Points"><input className="nx-input w-full" type="number" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })}/></Field>
          <Field label="Hint cost"><input className="nx-input w-full" type="number" value={form.hintCost} onChange={(e) => setForm({ ...form, hintCost: e.target.value })}/></Field>
          <Field label="Order in mission"><input className="nx-input w-full" type="number" value={form.orderInMission} onChange={(e) => setForm({ ...form, orderInMission: e.target.value })}/></Field>
        </div>
        <Field label="Hint text">
          <textarea className="nx-input w-full min-h-16" value={form.hintText} onChange={(e) => setForm({ ...form, hintText: e.target.value })}/>
        </Field>
        <div className="flex gap-2 justify-end pt-2">
          <button className="nx-btn nx-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="nx-btn nx-btn-solid" onClick={save}>Save</button>
        </div>
      </div>
    </Modal>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-nx-muted text-xs mb-1">{label}</div>
      {children}
    </div>
  );
}

// ============ Leaderboard ============
function LeaderboardTab() {
  const lb = usePolling<any[]>(() => api.get("/api/admin/leaderboard").then((r) => r.data), 5000);
  return (
    <div className="nx-card overflow-x-auto">
      <table className="w-full text-sm nx-mono">
        <thead className="text-xs text-nx-muted uppercase">
          <tr className="border-b border-nx-border">
            <th className="p-3 text-left">#</th>
            <th className="p-3 text-left">Team</th>
            <th className="p-3">Score</th>
            <th className="p-3">Mission</th>
            <th className="p-3">Vault</th>
          </tr>
        </thead>
        <tbody>
          {(lb.data ?? []).map((t, i) => (
            <tr key={t.id} className="border-b border-nx-border/60">
              <td className="p-3">{i + 1}</td>
              <td className="p-3 nx-display text-nx-cyan tracking-widest">{t.name}</td>
              <td className="p-3 text-center text-nx-green">{t.score}</td>
              <td className="p-3 text-center">{t.currentMission > 5 ? "VAULT" : t.currentMission}</td>
              <td className="p-3 text-center">{t.vaultUnlocked ? <span className="text-nx-magenta">BREACHED</span> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============ Activity ============
function ActivityTab() {
  const [team, setTeam] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const log = usePolling<any[]>(
    () => api.get("/api/admin/activity", { params: { teamId: team || undefined, action: action || undefined } }).then((r) => r.data),
    5000, [team, action],
  );
  return (
    <div>
      <div className="flex gap-2 mb-3 nx-mono text-sm">
        <input className="nx-input" placeholder="filter by teamId" value={team} onChange={(e) => setTeam(e.target.value)} />
        <select className="nx-input" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {["PUZZLE_SOLVED","PUZZLE_STEP_SOLVED","FRAGMENT_AWARDED","STAFF_VERIFY","WRONG_ANSWER","WRONG_FRAGMENT","HINT_USED","VAULT_ATTEMPT","VAULT_SUCCESS","SCORE_ADJUSTED","GAME_START","GAME_PAUSE","GAME_RESUME","GAME_FINISH"].map((a) =>
            <option key={a} value={a}>{a}</option>
          )}
        </select>
        <button className="nx-btn nx-btn-ghost" onClick={() => log.refresh()}>Refresh</button>
      </div>
      <div className="nx-card overflow-x-auto">
        <table className="w-full text-sm nx-mono">
          <thead className="text-xs text-nx-muted uppercase">
            <tr className="border-b border-nx-border">
              <th className="p-3 text-left">When</th>
              <th className="p-3 text-left">Team</th>
              <th className="p-3 text-left">Action</th>
              <th className="p-3 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {(log.data ?? []).map((l) => (
              <tr key={l.id} className="border-b border-nx-border/60">
                <td className="p-3 text-nx-muted whitespace-nowrap">{new Date(l.createdAt).toLocaleTimeString()}</td>
                <td className="p-3 text-nx-cyan">{l.team?.name ?? "—"}</td>
                <td className="p-3">{l.action}</td>
                <td className="p-3 text-xs text-nx-muted">
                  <pre className="whitespace-pre-wrap">{l.metadata ? JSON.stringify(l.metadata) : ""}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
