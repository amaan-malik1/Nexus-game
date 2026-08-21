import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { usePlayerAuth } from "../hooks/useAuth";
import { usePolling } from "../hooks/usePolling";
import { GlitchLabel, GlitchText } from "../components/GlitchText";
import { FragmentDisplay } from "../components/FragmentDisplay";
import { Scanlines } from "../components/Scanlines";
import { toast } from "../components/Toast";
import { formatTime, cx } from "../lib/format";

type GameStatus = "NOT_STARTED" | "RUNNING" | "PAUSED" | "FINISHED";

type Agent = {
  id: string;
  name: string;
  role: string;
  callsign: string;
  bio: string | null;
  photoUrl: string | null;
};

type MissionResp =
  | { done: true; message: string }
  | {
    done?: false;
    mission: {
      id: string;
      orderIndex: number;
      title: string;
      type: "CIPHER" | "PROTOCOL" | "DATA_CORRUPTION" | "LOGIC_LOCK" | "INSIDER";
      description: string;
      briefingText: string;
      totalSteps: number;
      agentClueText: string | null;
      agentAbout: string | null;
      agentLocation: string | null;
      agent: Agent | null;
    };
    step: number;
    awaitingFragment: boolean;
    challenge: {
      id: string;
      questionText: string;
      questionData: any;
      points: number;
      hintText: string | null;
      hintCost: number;
      orderInMission: number;
      requiresManualApproval: boolean;
    };
    teamMission: {
      status: string;
      hintUsed: boolean;
      wrongAttempts: number;
      fragmentAttempts: number;
      puzzleSolvedAt: string | null;
    };
  };

export default function PlayerGame() {
  const [params] = useSearchParams();
  const { isAuthed, team, join, logout } = usePlayerAuth();
  const codeFromUrl = (params.get("team") || "").toUpperCase();
  const [joining, setJoining] = useState(false);
  const [manualCode, setManualCode] = useState("");

  useEffect(() => {
    if (!isAuthed && codeFromUrl) {
      setJoining(true);
      join(codeFromUrl)
        .catch((e) => toast(e.response?.data?.error || "Invalid team code", "error"))
        .finally(() => setJoining(false));
    }
  }, [codeFromUrl, isAuthed, join]);

  if (!isAuthed) {
    return (
      <div className="min-h-screen nx-grid-bg flex items-center justify-center p-6">
        <Scanlines />
        <div className="nx-card nx-card-cyan p-6 w-full max-w-sm text-center">
          <GlitchLabel className="text-2xl">NEXUS</GlitchLabel>
          <div className="text-nx-muted text-xs mt-1 mb-6 nx-mono">
            {joining ? "> AUTHENTICATING…" : "> ENTER TEAM CODE"}
          </div>
          {!joining && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const code = manualCode.trim().toUpperCase();
                if (!code) return;
                try {
                  await join(code);
                } catch (err: any) {
                  toast(err.response?.data?.error || "Invalid code", "error");
                }
              }}
              className="space-y-3"
            >
              <input
                className="nx-input w-full text-center nx-display text-lg"
                placeholder="TEAM CODE"
                maxLength={12}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                autoFocus
              />
              <button className="nx-btn nx-btn-solid w-full">Connect</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return <PlayerGameInner team={team} onLogout={logout} />;
}

function PlayerGameInner({ team, onLogout }: { team: any; onLogout: () => void }) {
  const status = usePolling<{ status: GameStatus; remaining: number }>(
    () => api.get("/api/game/status").then((r) => r.data),
    3000,
  );

  const teamState = usePolling<any>(
    () => api.get("/api/game/team").then((r) => r.data),
    4000,
  );

  const mission = usePolling<MissionResp>(
    () => api.get("/api/game/mission").then((r) => r.data),
    4000,
    [teamState.data?.currentMission],
  );

  const [reveal, setReveal] = useState<{ value: number; order: number } | null>(null);
  // Local sub-phase inside AWAITING_FRAGMENT: "clue" first, then "entry".
  const [clueSeenFor, setClueSeenFor] = useState<string | null>(null);
  // Local briefing overlay lifecycle
  const [briefingDoneFor, setBriefingDoneFor] = useState<string | null>(null);

  const gameStatus = status.data?.status ?? "NOT_STARTED";
  const remaining = status.data?.remaining ?? 0;
  const fragments = teamState.data?.fragments ?? [];
  const collectedCount = fragments.length;
  const vaultUnlocked = teamState.data?.vaultUnlocked ?? false;

  const missionData = mission.data && !("done" in mission.data && mission.data.done) ? mission.data : null;
  const missionId = missionData?.mission?.id ?? null;

  // Reset briefing/clue local state when mission changes
  useEffect(() => {
    setClueSeenFor(null);
  }, [missionId]);

  // Screen dispatch — mutually exclusive
  const screen:
    | "waiting"
    | "briefing"
    | "challenge"
    | "clue"
    | "fragment"
    | "vault"
    | "success" =
    gameStatus === "NOT_STARTED"
      ? "waiting"
      : vaultUnlocked
        ? "success"
        : !missionData || (mission.data && "done" in mission.data && mission.data.done)
          ? "vault"
          : briefingDoneFor !== missionId
            ? "briefing"
            : missionData.awaitingFragment
              ? clueSeenFor === missionId
                ? "fragment"
                : "clue"
              : "challenge";

  return (
    <div className="min-h-[100dvh] nx-grid-bg text-nx-text">
      <Scanlines />
      <header className="sticky top-0 z-10 bg-nx-bg/85 backdrop-blur border-b border-nx-border">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between text-xs nx-mono">
          <div>
            <div className="text-nx-muted">TEAM</div>
            <div className="text-nx-cyan nx-display tracking-widest">{team?.name}</div>
          </div>
          <div className="text-right">
            <div className="text-nx-muted">SCORE</div>
            <div className="text-nx-green nx-display">{teamState.data?.score ?? "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-nx-muted">TIME</div>
            <div className={cx("nx-display", remaining < 60 && gameStatus === "RUNNING" ? "text-nx-danger" : "text-nx-cyan")}>
              {formatTime(remaining)}
            </div>
          </div>
        </div>
        <MissionProgress
          currentOrder={teamState.data?.currentMission ?? 1}
          completedCount={collectedCount}
        />
      </header>

      <main className="max-w-md mx-auto px-4 py-6">
        {screen === "waiting" && <Waiting teamName={team?.name} />}
        {screen === "briefing" && missionData && (
          <BriefingScreen
            key={`b-${missionId}`}
            mission={missionData.mission}
            onDone={() => setBriefingDoneFor(missionId)}
          />
        )}
        {screen === "challenge" && missionData && (
          <ChallengeScreen
            key={`c-${missionData.challenge.id}-${missionData.step}`}
            data={missionData}
            hintsUsed={teamState.data?.hintsUsed ?? 0}
            onSolved={() => {
              teamState.refresh();
              mission.refresh();
              // The mission poll will move status → AWAITING_FRAGMENT
              // clue screen will show automatically.
            }}
          />
        )}
        {screen === "clue" && missionData && (
          <ClueScreen
            key={`k-${missionId}`}
            mission={missionData.mission}
            challenge={missionData.challenge}
            missionType={missionData.mission.type}
            onProceed={() => setClueSeenFor(missionId)}
          />
        )}
        {screen === "fragment" && missionData && (
          <FragmentEntryScreen
            key={`f-${missionId}`}
            mission={missionData.mission}
            onCorrect={(value, order) => {
              setReveal({ value, order });
              setTimeout(() => setReveal(null), 2800);
              teamState.refresh();
              mission.refresh();
            }}
          />
        )}
        {screen === "vault" && (
          <VaultScreen
            fragments={fragments}
            vaultAttempts={teamState.data?.vaultAttempts ?? 0}
            onUnlock={teamState.refresh}
          />
        )}
        {screen === "success" && <SuccessScreen score={teamState.data?.score ?? 0} />}

        <div className="mt-8">
          <div className="text-center text-xs text-nx-muted mb-2 nx-mono">
            FRAGMENTS · {collectedCount}/5
          </div>
          <FragmentDisplay fragments={fragments} />
        </div>

        <div className="mt-10 text-center">
          <button className="nx-btn nx-btn-ghost text-xs" onClick={onLogout}>
            Leave team
          </button>
        </div>
      </main>

      <AnimatePresence>
        {reveal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9997] bg-black/85 grid place-items-center"
          >
            <motion.div
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 15 }}
              className="text-center"
            >
              <div className="text-nx-cyan nx-display text-sm tracking-[6px] mb-3">
                FRAGMENT ACQUIRED
              </div>
              <div className="nx-fragment nx-pulse" style={{ width: 160, height: 200, fontSize: 96 }}>
                {reveal.value}
              </div>
              <div className="text-nx-muted text-xs mt-3 nx-mono">
                MISSION {reveal.order} / 5
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- Progress ----------
function MissionProgress({
  currentOrder, completedCount,
}: { currentOrder: number; completedCount: number }) {
  return (
    <div className="max-w-md mx-auto px-4 pb-3 flex items-center gap-2">
      {[1, 2, 3, 4, 5].map((i) => {
        const done = i <= completedCount;
        const active = i === currentOrder && !done;
        return (
          <div
            key={i}
            className={cx(
              "flex-1 h-1.5 rounded transition-all",
              done ? "bg-nx-green" : active ? "bg-nx-cyan nx-pulse" : "bg-nx-border",
            )}
          />
        );
      })}
    </div>
  );
}

// ---------- Waiting ----------
function Waiting({ teamName }: { teamName?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="text-center pt-16"
    >
      <GlitchLabel className="text-3xl">NEXUS SYSTEM</GlitchLabel>
      <div className="text-nx-muted nx-mono text-sm mt-6">
        <div>TEAM <span className="text-nx-cyan">{teamName}</span> ONLINE</div>
        <div className="mt-1">STATUS: <span className="text-nx-yellow">WAITING</span></div>
      </div>
      <div className="mt-10 nx-mono text-xs text-nx-muted">
        <GlitchText text={"> AWAITING MISSION UPLINK\n> HOLD POSITION"} speed={35} />
      </div>
    </motion.div>
  );
}

// ---------- Briefing (auto-advances) ----------
function BriefingScreen({
  mission, onDone,
}: {
  mission: NonNullable<Extract<MissionResp, { done?: false }>["mission"]>;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-8">
      <div className="text-center text-nx-muted nx-mono text-xs mb-2">
        MISSION {mission.orderIndex} OF 5
      </div>
      <GlitchLabel className="block text-center text-2xl">{mission.title}</GlitchLabel>
      <div className="nx-card nx-card-cyan p-4 mt-6 nx-mono text-sm text-nx-cyan">
        <GlitchText text={mission.briefingText} speed={30} />
      </div>
    </motion.div>
  );
}

// ---------- Challenge (Phase A — puzzle) ----------
function ChallengeScreen({
  data, hintsUsed, onSolved,
}: {
  data: Extract<MissionResp, { done?: false }>;
  hintsUsed: number;
  onSolved: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [showHint, setShowHint] = useState<string | null>(data.challenge.hintText);

  useEffect(() => setShowHint(data.challenge.hintText), [data.challenge.id, data.challenge.hintText]);

  const submit = async () => {
    if (!answer.trim() && !data.challenge.requiresManualApproval) return;
    setBusy(true);
    try {
      const { data: r } = await api.post("/api/game/submit", {
        challengeId: data.challenge.id, answer,
      });
      if (r.correct) {
        setAnswer("");
        toast(`+${r.pointsAwarded ?? 50} points`, "success");
        onSolved();
      } else {
        setShake((n) => n + 1);
        toast(`Wrong answer (-${r.penalty ?? 20} pts)`, "error");
      }
    } catch (e: any) {
      toast(e.response?.data?.error || "Error", "error");
    } finally {
      setBusy(false);
    }
  };

  const requestHint = async () => {
    try {
      const { data: r } = await api.post("/api/game/hint", { challengeId: data.challenge.id });
      setShowHint(r.hint);
      toast(`Hint unlocked (-${r.cost ?? 0} pts)`, "warn");
    } catch (e: any) {
      toast(e.response?.data?.error || "Hint unavailable", "error");
    }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="pt-2">
      <div className="text-center text-nx-muted nx-mono text-xs">
        MISSION {data.mission.orderIndex} / 5 · STEP {data.step} / {data.mission.totalSteps + 1}
      </div>
      <GlitchLabel className="block text-center text-xl mt-1">{data.mission.title}</GlitchLabel>

      <div className="nx-card p-4 mt-4">
        <div className="text-nx-text nx-mono text-sm mb-3">{data.challenge.questionText}</div>
        <ChallengeBody type={data.mission.type} questionData={data.challenge.questionData} />
      </div>

      {data.challenge.requiresManualApproval ? (
        <div className="nx-card mt-4 p-4 text-center">
          <div className="text-nx-muted nx-mono text-xs mb-2">STAFF VERIFICATION REQUIRED</div>
          <div className="nx-mono text-sm">
            This challenge has no phone puzzle. Find the assigned agent — they will verify you and unlock the fragment.
          </div>
        </div>
      ) : (
        <>
          <motion.div key={shake} animate={{ x: shake ? [-8, 8, -6, 6, -3, 3, 0] : 0 }} transition={{ duration: 0.4 }} className="mt-4">
            <AnswerInput
              type={data.mission.type}
              value={answer}
              onChange={setAnswer}
              onSubmit={submit}
              disabled={busy}
            />
          </motion.div>
          <div className="mt-3 flex gap-2">
            <button className="nx-btn nx-btn-solid flex-1" onClick={submit} disabled={busy || !answer.trim()}>
              {busy ? "…" : "Submit"}
            </button>
            {!showHint && hintsUsed < 2 && (
              <button className="nx-btn nx-btn-ghost" onClick={requestHint} title={`-${data.challenge.hintCost} pts`}>
                Hint
              </button>
            )}
          </div>
          {showHint && (
            <div className="nx-card mt-3 p-3" style={{ borderColor: "#ffaa00" }}>
              <div className="text-nx-yellow nx-mono text-xs mb-1">HINT</div>
              <div className="nx-mono text-sm">{showHint}</div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

// ---------- Clue (post-puzzle "find the agent") ----------
function ClueScreen({
  mission, challenge, missionType, onProceed,
}: {
  mission: NonNullable<Extract<MissionResp, { done?: false }>["mission"]>;
  challenge: Extract<MissionResp, { done?: false }>["challenge"];
  missionType: string;
  onProceed: () => void;
}) {
  const agent = mission.agent;
  const isNoPuzzle = challenge.requiresManualApproval;
  const hasStructuredClue = !!(mission.agentAbout || mission.agentLocation);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="pt-4">
      <div className="text-center text-nx-muted nx-mono text-xs mb-1">
        MISSION {mission.orderIndex} / 5 · {isNoPuzzle ? "STEP 1 / 1" : "STEP 2 / 2"}
      </div>
      {!isNoPuzzle && (
        <div className="text-center text-nx-green nx-mono text-xs tracking-widest mb-2">✓ PUZZLE DECODED</div>
      )}
      <GlitchLabel color={isNoPuzzle ? "cyan" : "green"} className="block text-center text-xl mb-6">
        {isNoPuzzle ? "TARGET INTEL" : "TARGET IDENTIFIED"}
      </GlitchLabel>

      {/* Callsign header card */}
      <div className="nx-card nx-card-cyan p-5 text-center">
        {agent?.photoUrl && (
          <img src={agent.photoUrl} alt={agent.callsign} className="w-24 h-24 rounded-full mx-auto mb-3 border-2 border-nx-cyan object-cover" />
        )}
        <div className="text-nx-muted nx-mono text-xs mb-1">CALLSIGN</div>
        <div className="nx-display text-2xl text-nx-cyan nx-glow-cyan tracking-widest">
          {agent?.callsign ?? "TBD"}
        </div>
        {agent?.role && agent.role !== agent.callsign && (
          <div className="text-nx-muted nx-mono text-xs mt-1">{agent.role}</div>
        )}
      </div>

      {/* Structured appearance / about / location sections */}
      {hasStructuredClue ? (
        <div className="mt-3 space-y-2">
          {mission.agentAbout && (
            <ClueSection label="ABOUT" tint="magenta">
              {mission.agentAbout}
            </ClueSection>
          )}
          {mission.agentLocation && (
            <ClueSection label="LOCATION" tint="yellow">
              {mission.agentLocation}
            </ClueSection>
          )}
        </div>
      ) : (
        // Fallback for missions still using the old single-blob agentClueText
        (agent?.bio || mission.agentClueText) && (
          <div className="nx-card p-4 mt-3">
            <div className="nx-mono text-sm text-nx-text/90 whitespace-pre-line">
              {mission.agentClueText ?? agent?.bio}
            </div>
          </div>
        )
      )}

      {/* Show the puzzle body inside the clue screen when there's no phone puzzle
          (traits list for INSIDER, etc.) — this IS the physical clue. */}
      {isNoPuzzle && (
        <div className="nx-card p-4 mt-3">
          <div className="text-nx-yellow nx-mono text-xs mb-2 tracking-widest">MATCH ALL TRAITS</div>
          <ChallengeBody type={missionType} questionData={challenge.questionData} />
        </div>
      )}

      <div className="mt-4 nx-card p-3 text-center">
        <div className="text-nx-yellow nx-mono text-xs">
          Find the agent, complete their task, and they will hand you a single digit — your fragment.
        </div>
      </div>

      <button className="nx-btn nx-btn-solid w-full mt-4" onClick={onProceed}>
        I found them
      </button>
    </motion.div>
  );
}

function ClueSection({
  label, tint, children,
}: {
  label: string;
  tint: "cyan" | "magenta" | "yellow";
  children: React.ReactNode;
}) {
  const color =
    tint === "magenta" ? { border: "#ff00aa", label: "text-nx-magenta" }
      : tint === "yellow" ? { border: "#ffaa00", label: "text-nx-yellow" }
        : { border: "#00f0ff", label: "text-nx-cyan" };
  return (
    <div className="nx-card p-4" style={{ borderColor: color.border }}>
      <div className={`${color.label} nx-mono text-xs tracking-[3px] mb-1`}>{label}</div>
      <div className="nx-mono text-sm text-nx-text/95 whitespace-pre-line">{children}</div>
    </div>
  );
}

// ---------- Fragment Entry (Phase B) ----------
function FragmentEntryScreen({
  mission, onCorrect,
}: {
  mission: NonNullable<Extract<MissionResp, { done?: false }>["mission"]>;
  onCorrect: (value: number, order: number) => void;
}) {
  const [digit, setDigit] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const submit = async () => {
    if (!/^[0-9]$/.test(digit)) return;
    setBusy(true);
    try {
      const { data } = await api.post("/api/game/fragment", { digit });
      if (data.correct) {
        onCorrect(data.fragmentValue, data.missionOrder);
        setDigit("");
      } else {
        setShake((n) => n + 1);
        toast(`Wrong digit (-${data.penalty ?? 20} pts)`, "error");
      }
    } catch (e: any) {
      toast(e.response?.data?.error || "Error", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="pt-4">
      <div className="text-center text-nx-muted nx-mono text-xs">MISSION {mission.orderIndex} / 5</div>
      <GlitchLabel className="block text-center text-xl mt-1">ENTER FRAGMENT</GlitchLabel>
      <div className="text-center nx-mono text-xs text-nx-muted mt-4">
        Type the digit given to you by
      </div>
      <div className="text-center nx-display text-lg text-nx-cyan nx-glow-cyan tracking-widest mt-1">
        {mission.agent?.callsign ?? "THE AGENT"}
      </div>

      <motion.div
        key={shake}
        animate={{ x: shake ? [-10, 10, -6, 6, -3, 3, 0] : 0 }}
        transition={{ duration: 0.45 }}
        className="mt-8 flex justify-center"
      >
        <input
          className="nx-input text-center nx-display"
          style={{ width: 120, height: 140, fontSize: 72, letterSpacing: 0 }}
          inputMode="numeric"
          pattern="[0-9]"
          maxLength={1}
          value={digit}
          onChange={(e) => setDigit(e.target.value.replace(/\D/g, "").slice(0, 1))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoFocus
        />
      </motion.div>

      <button className="nx-btn nx-btn-solid w-full mt-6" onClick={submit} disabled={busy || !/^[0-9]$/.test(digit)}>
        {busy ? "…" : "Unlock Fragment"}
      </button>
      <div className="text-center nx-mono text-xs mt-3 text-nx-muted">
        Wrong digit = −20 pts. Retries allowed.
      </div>
    </motion.div>
  );
}

// ---------- Puzzle body renderers ----------
function ChallengeBody({ type, questionData }: { type: string; questionData: any }) {
  if (type === "CIPHER") {
    return (
      <div className="text-center py-2">
        <div className="text-nx-muted text-xs nx-mono mb-1">ENCRYPTED</div>
        <div className="nx-display text-2xl text-nx-magenta tracking-widest nx-glow-mag break-words">
          {questionData?.cipherText}
        </div>
        {questionData?.hintClue && (
          <div className="text-nx-muted text-xs mt-2 nx-mono">{questionData.hintClue}</div>
        )}
      </div>
    );
  }
  if (type === "PROTOCOL") {
    const legend: Record<string, string> = questionData?.legend ?? {};
    const directions: Record<string, string> = questionData?.directions ?? {};
    return (
      <div>
        <div className="grid grid-cols-5 gap-2 my-3">
          {Object.entries(legend).map(([sym, ch]) => (
            <div key={sym} className="nx-card p-2 text-center">
              <div className="text-xl">{sym}</div>
              <div className="text-nx-cyan nx-mono text-xs">{ch}</div>
            </div>
          ))}
        </div>
        <div className="text-center nx-display text-3xl text-nx-cyan nx-glow-cyan tracking-widest">
          {questionData?.encoded}
        </div>
        {directions && (
          <div className="mt-3 text-center text-nx-muted nx-mono text-xs">
            {Object.entries(directions).map(([k, v]) => <span key={k} className="mx-2">{k}→{v as string}</span>)}
          </div>
        )}
      </div>
    );
  }
  if (type === "DATA_CORRUPTION") {
    const entries: string[] = questionData?.entries ?? [];
    return (
      <div className="max-h-72 overflow-y-auto nx-card p-2 nx-mono text-sm">
        {entries.map((e, i) => (
          <div key={i} className="flex gap-3 py-0.5 border-b border-nx-border/50 last:border-0">
            <span className="text-nx-muted w-8 text-right">{i + 1}</span>
            <span className="text-nx-cyan">{e}</span>
          </div>
        ))}
      </div>
    );
  }
  if (type === "LOGIC_LOCK") {
    const clues: Array<{ code: string; hint: string }> = questionData?.clues ?? [];
    return (
      <div className="space-y-2">
        {clues.map((c, i) => (
          <div key={i} className="nx-card p-2 flex items-center gap-3">
            <span className="nx-display text-lg text-nx-cyan tracking-widest">{c.code}</span>
            <span className="text-xs text-nx-muted nx-mono">{c.hint}</span>
          </div>
        ))}
      </div>
    );
  }
  if (type === "INSIDER") {
    const traits: string[] = questionData?.traits ?? [];
    return (
      <ul className="space-y-2 mt-2">
        {traits.map((t, i) => (
          <li key={i} className="flex items-start gap-2 nx-mono text-sm">
            <span className="text-nx-cyan">▸</span> {t}
          </li>
        ))}
      </ul>
    );
  }
  return <div className="nx-mono text-xs text-nx-muted">Unsupported mission type.</div>;
}

// ---------- Answer inputs by type ----------
function AnswerInput({
  type, value, onChange, onSubmit, disabled,
}: {
  type: string; value: string; onChange: (v: string) => void; onSubmit: () => void; disabled: boolean;
}) {
  if (type === "LOGIC_LOCK") {
    const digits = value.padEnd(3, " ").slice(0, 3).split("");
    return (
      <div className="flex gap-2 justify-center">
        {[0, 1, 2].map((i) => (
          <input
            key={i}
            className="nx-input w-16 h-16 text-center nx-display text-2xl"
            inputMode="numeric" pattern="[0-9]" maxLength={1}
            value={digits[i].trim()}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "").slice(0, 1);
              const next = digits.slice(); next[i] = d || " ";
              onChange(next.join("").trim());
              if (d && i < 2) (document.querySelectorAll<HTMLInputElement>("input[data-lock]")[i + 1])?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
              if (e.key === "Backspace" && !digits[i].trim() && i > 0) {
                (document.querySelectorAll<HTMLInputElement>("input[data-lock]")[i - 1])?.focus();
              }
            }}
            disabled={disabled}
            data-lock
          />
        ))}
      </div>
    );
  }

  if (type === "DATA_CORRUPTION") {
    return (
      <input
        className="nx-input w-full text-center nx-display text-xl"
        inputMode="numeric" placeholder="LINE #"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        disabled={disabled} autoFocus
      />
    );
  }

  return (
    <input
      className="nx-input w-full text-center nx-mono tracking-widest uppercase"
      placeholder="DECODED MESSAGE"
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
      onKeyDown={(e) => e.key === "Enter" && onSubmit()}
      disabled={disabled} autoFocus
    />
  );
}

// ---------- Vault ----------
function VaultScreen({
  fragments, vaultAttempts, onUnlock,
}: {
  fragments: Array<{ value: number; missionOrder: number }>;
  vaultAttempts: number;
  onUnlock: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  const submit = async () => {
    const key = digits.join("");
    if (key.length !== 5) return;
    setBusy(true);
    try {
      const { data } = await api.post("/api/game/vault", { key });
      if (data.success) {
        toast("VAULT UNLOCKED", "success");
        onUnlock();
      } else {
        setShake((n) => n + 1);
        toast("ACCESS DENIED", "error");
      }
    } catch (e: any) {
      toast(e.response?.data?.error || "Vault error", "error");
    } finally {
      setBusy(false);
    }
  };

  const attemptsLeft = Math.max(0, 3 - vaultAttempts);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="pt-6">
      <div className="text-center text-nx-muted nx-mono text-xs">FINAL SEQUENCE</div>
      <GlitchLabel className="block text-center text-2xl mt-1">VAULT ACCESS</GlitchLabel>
      <div className="text-center nx-mono text-xs text-nx-muted mt-4">
        Enter the 5-digit master key from your collected fragments.
      </div>
      <div className="mt-6">
        <FragmentDisplay fragments={fragments} />
      </div>
      <motion.div key={shake} animate={{ x: shake ? [-10, 10, -6, 6, -3, 3, 0] : 0 }} transition={{ duration: 0.45 }} className="flex gap-2 justify-center mt-8">
        {digits.map((d, i) => (
          <input
            key={i}
            className="nx-input w-14 h-16 text-center nx-display text-2xl"
            inputMode="numeric" maxLength={1}
            value={d}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 1);
              const next = digits.slice(); next[i] = v;
              setDigits(next);
              if (v && i < 4) (document.querySelectorAll<HTMLInputElement>("input[data-vault]")[i + 1])?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Backspace" && !d && i > 0)
                (document.querySelectorAll<HTMLInputElement>("input[data-vault]")[i - 1])?.focus();
            }}
            data-vault
          />
        ))}
      </motion.div>
      <div className="text-center nx-mono text-xs mt-3 text-nx-muted">
        Attempts left: <span className="text-nx-yellow">{attemptsLeft}</span> · Wrong = −20 pts
      </div>
      <button className="nx-btn nx-btn-solid w-full mt-6" onClick={submit} disabled={busy || digits.join("").length !== 5 || attemptsLeft === 0}>
        {busy ? "…" : "CRACK THE VAULT"}
      </button>
    </motion.div>
  );
}

// ---------- Success ----------
function SuccessScreen({ score }: { score: number }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="pt-14 text-center">
      <motion.div animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1.6 }}>
        <GlitchLabel color="green" className="text-4xl">ACCESS GRANTED</GlitchLabel>
      </motion.div>
      <div className="text-nx-muted nx-mono text-sm mt-6">
        <GlitchText text={"> MASTER KEY VERIFIED\n> SYSTEM COMPROMISED\n> WELL DONE, AGENT."} speed={35} />
      </div>
      <div className="mt-8 nx-display text-nx-green nx-glow-green text-3xl">
        {score} PTS
      </div>
    </motion.div>
  );
}
