import { Request, Response } from "express";
import { z } from "zod";
import {
  prisma,
  getConfig,
  computeElapsed,
  generateTeamCode,
  recomputeMasterKey,
  ensureTeamMissions,
  awardFragmentAndAdvance,
} from "../services/game.service.js";
import { qrPngBuffer, qrPngDataUrl, playUrlFor } from "../services/qr.service.js";

// ---------- Game Control ----------

export async function getGame(_req: Request, res: Response) {
  const cfg = await getConfig();
  const elapsed = computeElapsed(cfg);
  res.json({ ...cfg, elapsed, remaining: Math.max(0, cfg.totalTime - elapsed) });
}

const patchGameSchema = z.object({
  action: z.enum(["START", "PAUSE", "RESUME", "STOP", "FINISH"]).optional(),
  totalTime: z.number().int().min(60).max(7200).optional(),
  gameName: z.string().min(1).max(60).optional(),
});

export async function patchGame(req: Request, res: Response) {
  const parsed = patchGameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { action, totalTime, gameName } = parsed.data;
  const cfg = await getConfig();
  const now = new Date();
  let update: any = {};
  if (totalTime !== undefined) update.totalTime = totalTime;
  if (gameName !== undefined) update.gameName = gameName;

  if (action === "START") {
    update.gameStatus = "RUNNING";
    update.startedAt = now;
    update.pausedAt = null;
    update.elapsedBeforePause = 0;
    // recompute master key on start (in case admin edited fragments)
    await recomputeMasterKey();
    // Ensure all existing teams have mission rows
    const teams = await prisma.team.findMany({ select: { id: true } });
    for (const t of teams) await ensureTeamMissions(t.id);
  } else if (action === "PAUSE" && cfg.gameStatus === "RUNNING") {
    const elapsed = computeElapsed(cfg);
    update.gameStatus = "PAUSED";
    update.pausedAt = now;
    update.elapsedBeforePause = elapsed;
  } else if (action === "RESUME" && cfg.gameStatus === "PAUSED") {
    update.gameStatus = "RUNNING";
    update.startedAt = now;
    update.pausedAt = null;
  } else if (action === "STOP" || action === "FINISH") {
    update.gameStatus = "FINISHED";
    update.pausedAt = now;
    update.elapsedBeforePause = computeElapsed(cfg);
  }

  const saved = await prisma.gameConfig.update({ where: { id: "singleton" }, data: update });
  await prisma.activityLog.create({ data: { action: `GAME_${action ?? "UPDATE"}`, metadata: update } });
  res.json(saved);
}

export async function resetGame(_req: Request, res: Response) {
  await prisma.$transaction([
    prisma.activityLog.deleteMany({}),
    prisma.teamFragment.deleteMany({}),
    prisma.teamMission.deleteMany({}),
    prisma.team.updateMany({
      data: {
        score: 100,
        hintsUsed: 0,
        currentMission: 1,
        vaultUnlocked: false,
        vaultUnlockedAt: null,
        vaultAttempts: 0,
      },
    }),
    prisma.gameConfig.update({
      where: { id: "singleton" },
      data: {
        gameStatus: "NOT_STARTED",
        startedAt: null,
        pausedAt: null,
        elapsedBeforePause: 0,
      },
    }),
  ]);
  res.json({ ok: true });
}

// ---------- Team Management ----------

export async function listTeams(_req: Request, res: Response) {
  const teams = await prisma.team.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      fragments: true,
      teamMissions: { include: { mission: true } },
    },
  });
  const shaped = teams.map((t) => ({
    id: t.id,
    name: t.name,
    code: t.code,
    score: t.score,
    hintsUsed: t.hintsUsed,
    currentMission: t.currentMission,
    vaultUnlocked: t.vaultUnlocked,
    vaultUnlockedAt: t.vaultUnlockedAt,
    vaultAttempts: t.vaultAttempts,
    fragmentsCollected: t.fragments.length,
    fragments: t.fragments
      .sort((a, b) => a.missionOrder - b.missionOrder)
      .map((f) => ({ value: f.value, missionOrder: f.missionOrder })),
    missions: t.teamMissions
      .sort((a, b) => a.mission.orderIndex - b.mission.orderIndex)
      .map((tm) => ({
        orderIndex: tm.mission.orderIndex,
        title: tm.mission.title,
        type: tm.mission.type,
        status: tm.status,
        hintUsed: tm.hintUsed,
        wrongAttempts: tm.wrongAttempts,
      })),
    playUrl: playUrlFor(t.code),
  }));
  res.json(shaped);
}

const createTeamSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  bulk: z.number().int().min(1).max(50).optional(),
});

export async function createTeam(req: Request, res: Response) {
  const parsed = createTeamSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, bulk } = parsed.data;

  async function uniqueCode() {
    for (let i = 0; i < 20; i++) {
      const c = generateTeamCode();
      const exists = await prisma.team.findUnique({ where: { code: c } });
      if (!exists) return c;
    }
    throw new Error("Could not generate unique code");
  }

  if (bulk) {
    const existing = await prisma.team.count();
    const created = [];
    for (let i = 0; i < bulk; i++) {
      const n = String(existing + i + 1).padStart(2, "0");
      const code = await uniqueCode();
      const team = await prisma.team.create({
        data: { name: `TEAM ${n}`, code },
      });
      created.push(team);
    }
    return res.json({ created: created.length, teams: created });
  }

  if (!name) return res.status(400).json({ error: "name or bulk required" });
  const code = await uniqueCode();
  const team = await prisma.team.create({ data: { name, code } });
  res.json(team);
}

export async function deleteTeam(req: Request, res: Response) {
  await prisma.team.delete({ where: { id: String(req.params.id) } });
  res.json({ ok: true });
}

const adjustSchema = z.object({ delta: z.number().int() });

export async function adjustScore(req: Request, res: Response) {
  const parsed = adjustSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const team = await prisma.team.update({
    where: { id: String(req.params.id) },
    data: { score: { increment: parsed.data.delta } },
  });
  await prisma.activityLog.create({
    data: { teamId: team.id, action: "SCORE_ADJUSTED", metadata: { delta: parsed.data.delta } },
  });
  res.json(team);
}

/**
 * Staff verify — awards the fragment for the target mission and advances the team.
 * Body may specify { missionOrder }; defaults to the team's current mission.
 * Used as the fallback when a team can't type the digit (or for INSIDER-style missions
 * where there's no phone puzzle at all).
 */
export async function verifyFragment(req: Request, res: Response) {
  const teamId = String(req.params.id);
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return res.status(404).json({ error: "Team not found" });

  const targetOrder =
    typeof req.body?.missionOrder === "number" ? req.body.missionOrder : team.currentMission;

  const mission = await prisma.mission.findFirst({
    where: { orderIndex: targetOrder, isActive: true },
  });
  if (!mission) return res.status(400).json({ error: `No active mission with order ${targetOrder}` });

  const result = await awardFragmentAndAdvance(teamId, mission.id);
  await prisma.activityLog.create({
    data: {
      teamId,
      action: "STAFF_VERIFY",
      metadata: { missionOrder: mission.orderIndex, bonus: result.bonus },
    },
  });
  res.json(result);
}

// Backward-compatible alias for the old /approve-mission route.
export const approveMission = verifyFragment;

export async function qrForTeam(req: Request, res: Response) {
  const team = await prisma.team.findUnique({ where: { id: String(req.params.id) } });
  if (!team) return res.status(404).json({ error: "Team not found" });
  const buf = await qrPngBuffer(team.code);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", `inline; filename="${team.code}.png"`);
  res.send(buf);
}

export async function qrSheet(_req: Request, res: Response) {
  const teams = await prisma.team.findMany({ orderBy: { createdAt: "asc" } });
  const cards = await Promise.all(
    teams.map(async (t) => ({
      name: t.name,
      code: t.code,
      qr: await qrPngDataUrl(t.code),
    })),
  );
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>NEXUS QR sheet</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: 'JetBrains Mono', ui-monospace, monospace; margin: 0; background: #fff; color: #0a0a0f; }
  h1 { font-family: 'Orbitron', sans-serif; letter-spacing: 4px; text-align:center; margin: 4mm 0; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
  .card { border: 1.5px dashed #0a0a0f; padding: 4mm; text-align: center; break-inside: avoid; border-radius: 4mm; }
  .name { font-weight: 700; letter-spacing: 2px; margin-bottom: 2mm; }
  .code { font-size: 11pt; letter-spacing: 3px; margin-top: 2mm; }
  img { width: 100%; max-width: 50mm; }
</style></head><body>
<h1>NEXUS · SCAN TO PLAY</h1>
<div class="grid">
${cards
  .map(
    (c) => `<div class="card"><div class="name">${c.name}</div><img src="${c.qr}"/><div class="code">${c.code}</div></div>`,
  )
  .join("")}
</div>
</body></html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}

// ---------- Mission & Challenge Management ----------

export async function listMissions(_req: Request, res: Response) {
  const missions = await prisma.mission.findMany({
    orderBy: { orderIndex: "asc" },
    include: {
      challenges: { orderBy: { orderInMission: "asc" } },
      agent: true,
    },
  });
  res.json(missions);
}

export async function listTechTeam(_req: Request, res: Response) {
  const members = await prisma.techTeamMember.findMany({ orderBy: { order: "asc" } });
  res.json(members);
}

const memberSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  agentCallsign: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  order: z.number().int().min(0).max(999).optional(),
});

export async function upsertTechMember(req: Request, res: Response) {
  const parsed = memberSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const id = String(req.params.id);
  if (id) {
    const m = await prisma.techTeamMember.update({ where: { id }, data: parsed.data });
    return res.json(m);
  }
  const full = memberSchema.safeParse(req.body);
  if (!full.success) return res.status(400).json({ error: full.error.flatten() });
  const m = await prisma.techTeamMember.create({ data: full.data });
  res.json(m);
}

export async function deleteTechMember(req: Request, res: Response) {
  await prisma.techTeamMember.delete({ where: { id: String(req.params.id) } });
  res.json({ ok: true });
}

const missionSchema = z.object({
  orderIndex: z.number().int(),
  title: z.string().min(1),
  type: z.enum(["CIPHER", "PROTOCOL", "DATA_CORRUPTION", "LOGIC_LOCK", "INSIDER"]),
  description: z.string().default(""),
  briefingText: z.string().default(""),
  isActive: z.boolean().optional(),
  agentClueText: z.string().nullable().optional(),
  agentAppearance: z.string().nullable().optional(),
  agentAbout: z.string().nullable().optional(),
  agentLocation: z.string().nullable().optional(),
  agentMemberId: z.string().nullable().optional(),
});

export async function createMission(req: Request, res: Response) {
  const parsed = missionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const mission = await prisma.mission.create({ data: parsed.data });
  await recomputeMasterKey();
  res.json(mission);
}

export async function updateMission(req: Request, res: Response) {
  const parsed = missionSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const mission = await prisma.mission.update({ where: { id: String(req.params.id) }, data: parsed.data });
  await recomputeMasterKey();
  res.json(mission);
}

export async function deleteMission(req: Request, res: Response) {
  await prisma.mission.delete({ where: { id: String(req.params.id) } });
  await recomputeMasterKey();
  res.json({ ok: true });
}

const challengeSchema = z.object({
  questionText: z.string().min(1),
  questionData: z.any().default({}),
  answer: z.string().nullable().optional(),
  fragmentValue: z.number().int().min(0).max(9).nullable().optional(),
  points: z.number().int().min(0).max(1000).optional(),
  hintText: z.string().nullable().optional(),
  hintCost: z.number().int().min(0).max(500).optional(),
  orderInMission: z.number().int().min(1).max(20).optional(),
  isAlternate: z.boolean().optional(),
});

export async function addChallenge(req: Request, res: Response) {
  const parsed = challengeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const ch = await prisma.challenge.create({
    data: { ...parsed.data, questionData: parsed.data.questionData ?? {}, missionId: String(req.params.id) },
  });
  await recomputeMasterKey();
  res.json(ch);
}

export async function updateChallenge(req: Request, res: Response) {
  const parsed = challengeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const ch = await prisma.challenge.update({ where: { id: String(req.params.id) }, data: parsed.data });
  await recomputeMasterKey();
  res.json(ch);
}

export async function deleteChallenge(req: Request, res: Response) {
  await prisma.challenge.delete({ where: { id: String(req.params.id) } });
  await recomputeMasterKey();
  res.json({ ok: true });
}

// ---------- Activity & Leaderboard ----------

export async function activityFeed(req: Request, res: Response) {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const teamId = typeof req.query.teamId === "string" ? req.query.teamId : undefined;
  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const logs = await prisma.activityLog.findMany({
    where: { ...(teamId ? { teamId } : {}), ...(action ? { action } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { team: { select: { name: true, code: true } } },
  });
  res.json(logs);
}

export async function adminLeaderboard(_req: Request, res: Response) {
  const teams = await prisma.team.findMany({
    orderBy: [{ score: "desc" }, { vaultUnlockedAt: "asc" }, { createdAt: "asc" }],
  });
  res.json(teams);
}
