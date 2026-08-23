import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { api } from "../lib/api";
import { usePolling } from "../hooks/usePolling";
import { Scanlines } from "../components/Scanlines";
import { GlitchLabel } from "../components/GlitchText";
import { formatTime, cx } from "../lib/format";

type ProjectorState = {
  gameName: string;
  status: "NOT_STARTED" | "RUNNING" | "PAUSED" | "FINISHED";
  totalTime: number;
  elapsed: number;
  remaining: number;
  leaderboard: Array<{ rank: number; id: string; name: string; score: number; currentMission: number; vaultUnlocked: boolean }>;
  breach: null | { teamId: string; teamName: string; unlockedAt: string; ageMs: number };
  techTeam: Array<{ id: string; name: string; role: string; photoUrl?: string; bio?: string; order: number }>;
};

export default function ProjectorView() {
  const { data } = usePolling<ProjectorState>(
    () => api.get("/api/projector/state").then((r) => r.data),
    3000,
  );

  // Track breach events by teamId; when a new one appears, take over the screen.
  const [activeBreach, setActiveBreach] = useState<{ teamName: string; startedAt: number } | null>(null);
  const seenBreach = useRef<string | null>(null);

  useEffect(() => {
    if (!data?.breach) return;
    const key = `${data.breach.teamId}:${data.breach.unlockedAt}`;
    if (seenBreach.current === key) return;
    seenBreach.current = key;
    setActiveBreach({ teamName: data.breach.teamName, startedAt: Date.now() });
    // Hold for 10s
    const t = setTimeout(() => setActiveBreach(null), 10_000);
    return () => clearTimeout(t);
  }, [data?.breach]);

  if (!data) return <ProjectorLoading />;

  return (
    <div className="min-h-[100dvh] relative overflow-hidden nx-grid-bg">
      <Scanlines />
      {activeBreach ? (
        <BreachSequence teamName={activeBreach.teamName} />
      ) : data.status === "FINISHED" ? (
        <FinishedReveal techTeam={data.techTeam} />
      ) : data.status === "NOT_STARTED" ? (
        <PreGame />
      ) : (
        <LeaderboardMode data={data} />
      )}
    </div>
  );
}

function ProjectorLoading() {
  return (
    <div className="min-h-[100dvh] grid place-items-center nx-grid-bg">
      <GlitchLabel className="text-4xl">CONNECTING…</GlitchLabel>
    </div>
  );
}

// ============ Pre-game ============
function PreGame() {
  const titleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!titleRef.current) return;
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 3 });
    tl.to(titleRef.current, { x: -3, duration: 0.05 })
      .to(titleRef.current, { x: 4, duration: 0.05 })
      .to(titleRef.current, { x: 0, duration: 0.05 });
    return () => { tl.kill(); };
  }, []);
  return (
    <div className="min-h-[100dvh] grid place-items-center">
      <div className="text-center">
        <div ref={titleRef}>
          <GlitchLabel className="text-8xl md:text-9xl">NEXUS</GlitchLabel>
        </div>
        <div className="text-nx-magenta nx-glow-mag nx-display text-3xl md:text-5xl mt-8 tracking-[10px]">
          SECURITY BREACH
        </div>
        <div className="text-nx-muted nx-mono text-2xl mt-6 tracking-widest">
          03 FRAGMENTS MISSING
        </div>
        <div className="text-nx-cyan nx-mono text-sm mt-16 tracking-[6px] opacity-70">
          AWAITING OPERATIVES
        </div>
      </div>
    </div>
  );
}

// ============ Leaderboard Mode ============
function LeaderboardMode({ data }: { data: ProjectorState }) {
  const rowsRef = useRef<HTMLDivElement>(null);
  const prevOrder = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!rowsRef.current) return;
    const nextOrder = new Map(data.leaderboard.map((t, i) => [t.id, i]));
    // Animate any row that moved
    data.leaderboard.forEach((t) => {
      const el = rowsRef.current!.querySelector<HTMLElement>(`[data-team="${t.id}"]`);
      if (!el) return;
      const prev = prevOrder.current.get(t.id);
      const next = nextOrder.get(t.id)!;
      if (prev !== undefined && prev !== next) {
        const delta = (prev - next) * 76; // ~row height
        gsap.fromTo(el, { y: delta, opacity: 0.4 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" });
      }
    });
    prevOrder.current = nextOrder;
  }, [data.leaderboard]);

  return (
    <div className="p-8 md:p-12 min-h-[100dvh] flex flex-col">
      <div className="flex items-baseline justify-between">
        <GlitchLabel className="text-5xl md:text-6xl">{data.gameName}</GlitchLabel>
        <div className="nx-display text-nx-cyan nx-glow-cyan text-5xl md:text-7xl">
          {formatTime(data.remaining)}
        </div>
      </div>
      <div className="nx-mono text-nx-muted text-sm tracking-[6px] mt-2">
        STATUS: <span className={cx(
          data.status === "RUNNING" ? "text-nx-green" :
          data.status === "PAUSED" ? "text-nx-yellow" :
          "text-nx-muted"
        )}>{data.status.replace("_", " ")}</span>
      </div>

      <div ref={rowsRef} className="mt-8 flex-1 grid grid-cols-1 gap-3 content-start">
        {data.leaderboard.slice(0, 15).map((t) => (
          <div
            key={t.id}
            data-team={t.id}
            className={cx(
              "nx-card flex items-center gap-6 px-6 py-4",
              t.vaultUnlocked && "nx-card-cyan",
            )}
          >
            <div className="nx-display text-4xl md:text-5xl text-nx-muted w-16 text-right">
              {String(t.rank).padStart(2, "0")}
            </div>
            <div className="flex-1 nx-display text-2xl md:text-4xl tracking-widest text-nx-cyan nx-glow-cyan">
              {t.name}
            </div>
            <div className="text-nx-muted nx-mono text-sm w-32 text-right">
              M{t.currentMission > 4 ? "4+" : t.currentMission}/4
            </div>
            <div className="nx-display text-3xl md:text-5xl text-nx-green tabular-nums w-32 text-right">
              {t.score}
            </div>
            {t.vaultUnlocked && (
              <div className="nx-display text-nx-magenta nx-glow-mag text-sm tracking-widest w-32 text-right">
                ✓ BREACHED
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ Vault Breach Sequence ============
function BreachSequence({ teamName }: { teamName: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const stageRefs = {
    auth: useRef<HTMLDivElement>(null),
    attempting: useRef<HTMLDivElement>(null),
    verified: useRef<HTMLDivElement>(null),
    granted: useRef<HTMLDivElement>(null),
    breach: useRef<HTMLDivElement>(null),
    stolen: useRef<HTMLDivElement>(null),
  };

  useEffect(() => {
    const tl = gsap.timeline();
    // Flash + glitch entry
    if (rootRef.current) {
      tl.fromTo(rootRef.current, { opacity: 0 }, { opacity: 1, duration: 0.15 });
      tl.to(rootRef.current, { x: -6, duration: 0.04 })
        .to(rootRef.current, { x: 8, duration: 0.04 })
        .to(rootRef.current, { x: 0, duration: 0.04 });
    }

    const show = (r: React.RefObject<HTMLDivElement>) =>
      r.current && tl.fromTo(r.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35 });

    show(stageRefs.auth);
    tl.to({}, { duration: 0.5 });
    show(stageRefs.attempting);
    if (barRef.current) {
      tl.fromTo(barRef.current, { scaleX: 0 }, { scaleX: 1, duration: 1.6, ease: "power1.inOut" });
    }
    show(stageRefs.verified);
    tl.to({}, { duration: 0.3 });
    show(stageRefs.granted);
    tl.to({}, { duration: 0.5 });
    show(stageRefs.breach);
    show(stageRefs.stolen);

    return () => { tl.kill(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamName]);

  return (
    <div ref={rootRef} className="min-h-[100dvh] grid place-items-center px-10">
      <div className="max-w-5xl w-full space-y-6 text-center">
        <div ref={stageRefs.auth} className="opacity-0">
          <GlitchLabel className="text-4xl md:text-5xl">SYSTEM AUTHENTICATION</GlitchLabel>
        </div>
        <div ref={stageRefs.attempting} className="opacity-0 nx-mono text-nx-cyan tracking-[6px] text-xl md:text-2xl">
          TEAM {teamName} ATTEMPTING ACCESS…
        </div>
        <div className="w-full h-2 border border-nx-cyan rounded overflow-hidden">
          <div ref={barRef} className="h-full origin-left bg-nx-cyan" style={{ transform: "scaleX(0)" }} />
        </div>
        <div ref={stageRefs.verified} className="opacity-0 nx-mono text-nx-green tracking-[6px] text-xl md:text-2xl">
          KEY VERIFIED
        </div>
        <div ref={stageRefs.granted} className="opacity-0">
          <GlitchLabel color="green" className="text-5xl md:text-7xl">ACCESS GRANTED</GlitchLabel>
        </div>
        <div ref={stageRefs.breach} className="opacity-0 nx-display text-nx-magenta nx-glow-mag text-3xl md:text-5xl tracking-[6px]">
          🚨 SECURITY BREACH 🚨
        </div>
        <div ref={stageRefs.stolen} className="opacity-0 nx-display text-nx-magenta text-2xl md:text-4xl tracking-widest">
          TEAM {teamName} HAS STOLEN THE MASTER KEY
        </div>
      </div>
    </div>
  );
}

// ============ Finished / Reveal ============
function FinishedReveal({ techTeam }: { techTeam: ProjectorState["techTeam"] }) {
  const [stage, setStage] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [memberIdx, setMemberIdx] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 2000);
    const t2 = setTimeout(() => setStage(2), 5000);
    const t3 = setTimeout(() => setStage(3), 9000);
    const t4 = setTimeout(() => setStage(4), 12500);
    return () => { [t1, t2, t3, t4].forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    if (stage < 4 || techTeam.length === 0) return;
    const id = setInterval(() => setMemberIdx((i) => (i + 1) % techTeam.length), 4000);
    return () => clearInterval(id);
  }, [stage, techTeam.length]);

  return (
    <div className="min-h-[100dvh] grid place-items-center px-10">
      <div className="text-center space-y-8">
        {stage >= 0 && <GlitchLabel color="green" className="text-6xl md:text-8xl">CONGRATULATIONS</GlitchLabel>}
        {stage >= 1 && <div className="nx-display text-nx-cyan nx-glow-cyan text-3xl md:text-5xl tracking-widest">YOU CRACKED THE SYSTEM</div>}
        {stage >= 2 && <div className="nx-mono text-nx-muted text-xl md:text-2xl mt-8">BUT THERE WAS ONE THING YOU DIDN'T HAVE TO HACK.</div>}
        {stage >= 3 && <div className="nx-mono text-nx-text text-2xl md:text-3xl">THE PEOPLE BEHIND IT.</div>}
        {stage >= 4 && (
          <div className="mt-10">
            <div className="nx-display text-nx-magenta nx-glow-mag text-4xl md:text-6xl tracking-widest">MEET THE TECH TEAM</div>
            {techTeam.length > 0 ? (
              <MemberCard m={techTeam[memberIdx]} />
            ) : (
              <div className="text-nx-muted nx-mono text-sm mt-6">
                (Configure Tech Team members in the database to display them here.)
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MemberCard({ m }: { m: ProjectorState["techTeam"][number] }) {
  return (
    <div className="mt-8 nx-card nx-card-cyan p-8 max-w-2xl mx-auto">
      {m.photoUrl && (
        <img src={m.photoUrl} alt={m.name} className="w-40 h-40 rounded-full object-cover mx-auto mb-4 border-2 border-nx-cyan" />
      )}
      <div className="nx-display text-3xl text-nx-cyan nx-glow-cyan tracking-widest">{m.name}</div>
      <div className="nx-mono text-nx-magenta text-lg mt-2 tracking-widest">{m.role}</div>
      {m.bio && <div className="nx-mono text-nx-muted text-sm mt-4">{m.bio}</div>}
    </div>
  );
}
