import { Request, Response } from "express";
import { z } from "zod";
import {
  prisma,
  getConfig,
  computeElapsed,
  ensureTeamMissions,
  answerMatches,
  normalize,
  awardFragmentAndAdvance,
} from "../services/game.service.js";

function teamIdOf(req: Request): string | null {
  return req.auth?.role === "PLAYER" ? req.auth.teamId : null;
}

export async function gameStatus(_req: Request, res: Response) {
  const cfg = await getConfig();
  const elapsed = computeElapsed(cfg);
  const remaining = Math.max(0, cfg.totalTime - elapsed);
  res.json({
    status: cfg.gameStatus,
    totalTime: cfg.totalTime,
    elapsed,
    remaining,
    startedAt: cfg.startedAt,
  });
}

export async function teamState(req: Request, res: Response) {
  const teamId = teamIdOf(req);
  if (!teamId) return res.status(403).json({ error: "Player only" });
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      fragments: { orderBy: { missionOrder: "asc" } },
      teamMissions: { include: { mission: true } },
    },
  });
  if (!team) return res.status(404).json({ error: "Team not found" });
  res.json({
    id: team.id,
    name: team.name,
    code: team.code,
    score: team.score,
    hintsUsed: team.hintsUsed,
    currentMission: team.currentMission,
    vaultUnlocked: team.vaultUnlocked,
    vaultUnlockedAt: team.vaultUnlockedAt,
    vaultAttempts: team.vaultAttempts,
    fragments: team.fragments.map((f) => ({
      value: f.value,
      missionOrder: f.missionOrder,
    })),
    missions: team.teamMissions
      .sort((a, b) => a.mission.orderIndex - b.mission.orderIndex)
      .map((tm) => ({
        orderIndex: tm.mission.orderIndex,
        title: tm.mission.title,
        type: tm.mission.type,
        status: tm.status,
        hintUsed: tm.hintUsed,
      })),
  });
}

export async function currentMission(req: Request, res: Response) {
  const teamId = teamIdOf(req);
  if (!teamId) return res.status(403).json({ error: "Player only" });
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return res.status(404).json({ error: "Team not found" });
  await ensureTeamMissions(teamId);

  const mission = await prisma.mission.findFirst({
    where: { orderIndex: team.currentMission, isActive: true },
    include: {
      challenges: { orderBy: { orderInMission: "asc" } },
      agent: true,
    },
  });

  if (!mission) {
    return res.json({ done: true, message: "All missions complete." });
  }

  let tm = await prisma.teamMission.findUnique({
    where: { teamId_missionId: { teamId, missionId: mission.id } },
  });

  const step = tm?.currentStep ?? 1;
  const challenge = mission.challenges.find((c) => c.orderInMission === step) ??
    mission.challenges[0];
  if (!challenge) return res.json({ done: false, mission: null });

  // Missions with no phone puzzle (INSIDER, etc.) skip the puzzle-submit
  // phase entirely — the traits ARE the physical clue. Auto-transition
  // to AWAITING_FRAGMENT so the client shows the clue + digit entry.
  if (challenge.answer === null && tm && tm.status === "ACTIVE") {
    tm = await prisma.teamMission.update({
      where: { teamId_missionId: { teamId, missionId: mission.id } },
      data: { status: "AWAITING_FRAGMENT", puzzleSolvedAt: new Date() },
    });
  }

  const awaitingFragment = tm?.status === "AWAITING_FRAGMENT";

  res.json({
    mission: {
      id: mission.id,
      orderIndex: mission.orderIndex,
      title: mission.title,
      type: mission.type,
      description: mission.description,
      briefingText: mission.briefingText,
      totalSteps: mission.challenges.length,
      agentClueText: mission.agentClueText ?? null,
      agentAppearance: mission.agentAppearance ?? null,
      agentAbout: mission.agentAbout ?? null,
      agentLocation: mission.agentLocation ?? null,
      agent: mission.agent
        ? {
            id: mission.agent.id,
            name: mission.agent.name,
            role: mission.agent.role,
            callsign: mission.agent.agentCallsign ?? mission.agent.role,
            bio: mission.agent.bio ?? null,
            photoUrl: mission.agent.photoUrl ?? null,
          }
        : null,
    },
    step,
    awaitingFragment,
    challenge: {
      id: challenge.id,
      questionText: challenge.questionText,
      questionData: challenge.questionData,
      points: challenge.points,
      hintText: tm?.hintUsed ? challenge.hintText : null,
      hintCost: challenge.hintCost,
      orderInMission: challenge.orderInMission,
      requiresManualApproval: challenge.answer === null,
    },
    teamMission: {
      status: tm?.status ?? "LOCKED",
      hintUsed: tm?.hintUsed ?? false,
      wrongAttempts: tm?.wrongAttempts ?? 0,
      fragmentAttempts: tm?.fragmentAttempts ?? 0,
      puzzleSolvedAt: tm?.puzzleSolvedAt ?? null,
    },
  });
}

const submitSchema = z.object({
  challengeId: z.string(),
  answer: z.string().min(1).max(200),
});

/**
 * Phase A: validate puzzle answer.
 * - Intermediate step correct → advance step, no fragment.
 * - Final step correct → transition to AWAITING_FRAGMENT, return agent clue. NO fragment yet.
 * - answer:null challenges (INSIDER) → rejected; use staff verify-fragment.
 */
export async function submitAnswer(req: Request, res: Response) {
  const teamId = teamIdOf(req);
  if (!teamId) return res.status(403).json({ error: "Player only" });
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const cfg = await getConfig();
  if (cfg.gameStatus !== "RUNNING")
    return res.status(400).json({ error: "Game is not running" });

  const challenge = await prisma.challenge.findUnique({
    where: { id: parsed.data.challengeId },
    include: {
      mission: {
        include: {
          challenges: { orderBy: { orderInMission: "asc" } },
          agent: true,
        },
      },
    },
  });
  if (!challenge) return res.status(404).json({ error: "Challenge not found" });

  if (challenge.answer === null) {
    return res.status(400).json({
      error: "This challenge has no phone puzzle. Find the assigned agent — they will verify you.",
      requiresManualApproval: true,
    });
  }

  const correct = answerMatches(challenge, parsed.data.answer);

  if (!correct) {
    await prisma.$transaction([
      prisma.teamMission.update({
        where: { teamId_missionId: { teamId, missionId: challenge.missionId } },
        data: { wrongAttempts: { increment: 1 } },
      }),
      prisma.team.update({
        where: { id: teamId },
        data: { score: { decrement: 20 } },
      }),
      prisma.activityLog.create({
        data: {
          teamId,
          action: "WRONG_ANSWER",
          metadata: { challengeId: challenge.id, submitted: normalize(parsed.data.answer), cost: 20 },
        },
      }),
    ]);
    return res.json({ correct: false, penalty: 20 });
  }

  // Correct answer — always +50 (whether intermediate step or final step)
  const CORRECT_ANSWER_POINTS = 50;
  const total = challenge.mission.challenges.length;
  const isFinalStep = challenge.orderInMission >= total;

  // Batched writes — no interactive callback tx (Neon-serverless-safe)
  let result: {
    advancedTo: number;
    awaitingFragment: boolean;
    pointsAwarded: number;
  };
  if (!isFinalStep) {
    await prisma.$transaction([
      prisma.team.update({
        where: { id: teamId },
        data: { score: { increment: CORRECT_ANSWER_POINTS } },
      }),
      prisma.teamMission.update({
        where: { teamId_missionId: { teamId, missionId: challenge.missionId } },
        data: { currentStep: challenge.orderInMission + 1 },
      }),
      prisma.activityLog.create({
        data: {
          teamId,
          action: "PUZZLE_STEP_SOLVED",
          metadata: { challengeId: challenge.id, step: challenge.orderInMission, points: CORRECT_ANSWER_POINTS },
        },
      }),
    ]);
    result = {
      advancedTo: challenge.orderInMission + 1,
      awaitingFragment: false,
      pointsAwarded: CORRECT_ANSWER_POINTS,
    };
  } else {
    await prisma.$transaction([
      prisma.team.update({
        where: { id: teamId },
        data: { score: { increment: CORRECT_ANSWER_POINTS } },
      }),
      prisma.teamMission.update({
        where: { teamId_missionId: { teamId, missionId: challenge.missionId } },
        data: { status: "AWAITING_FRAGMENT", puzzleSolvedAt: new Date() },
      }),
      prisma.activityLog.create({
        data: {
          teamId,
          action: "PUZZLE_SOLVED",
          metadata: { missionId: challenge.missionId, orderIndex: challenge.mission.orderIndex, points: CORRECT_ANSWER_POINTS },
        },
      }),
    ]);
    result = {
      advancedTo: challenge.orderInMission,
      awaitingFragment: true,
      pointsAwarded: CORRECT_ANSWER_POINTS,
    };
  }

  const responseBase: Record<string, unknown> = { correct: true, ...result };
  if (result.awaitingFragment) {
    responseBase.agent = challenge.mission.agent
      ? {
          id: challenge.mission.agent.id,
          name: challenge.mission.agent.name,
          role: challenge.mission.agent.role,
          callsign: challenge.mission.agent.agentCallsign ?? challenge.mission.agent.role,
          bio: challenge.mission.agent.bio ?? null,
          photoUrl: challenge.mission.agent.photoUrl ?? null,
        }
      : null;
    responseBase.agentClueText = challenge.mission.agentClueText ?? null;
    responseBase.agentAppearance = challenge.mission.agentAppearance ?? null;
    responseBase.agentAbout = challenge.mission.agentAbout ?? null;
    responseBase.agentLocation = challenge.mission.agentLocation ?? null;
  }
  res.json(responseBase);
}

const fragmentSchema = z.object({
  digit: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

/**
 * Phase B: player types the digit received from the assigned Tech Team agent.
 * Only accepted when the team's current mission is in AWAITING_FRAGMENT.
 */
export async function submitFragment(req: Request, res: Response) {
  const teamId = teamIdOf(req);
  if (!teamId) return res.status(403).json({ error: "Player only" });
  const parsed = fragmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const cfg = await getConfig();
  if (cfg.gameStatus !== "RUNNING")
    return res.status(400).json({ error: "Game is not running" });

  const digit = parsed.data.digit.trim();
  if (!/^[0-9]$/.test(digit))
    return res.status(400).json({ error: "Fragment must be a single digit 0-9" });

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return res.status(404).json({ error: "Team not found" });

  const mission = await prisma.mission.findFirst({
    where: { orderIndex: team.currentMission, isActive: true },
    include: { challenges: { orderBy: { orderInMission: "asc" } } },
  });
  if (!mission) return res.status(400).json({ error: "No active mission" });

  const tm = await prisma.teamMission.findUnique({
    where: { teamId_missionId: { teamId, missionId: mission.id } },
  });
  if (!tm) return res.status(400).json({ error: "Team mission row missing" });
  if (tm.status !== "AWAITING_FRAGMENT")
    return res.status(400).json({ error: "Solve the puzzle first before entering a fragment." });

  const fragmentChallenge =
    [...mission.challenges].reverse().find((c) => c.fragmentValue !== null && c.fragmentValue !== undefined) ??
    mission.challenges[mission.challenges.length - 1];
  if (!fragmentChallenge || fragmentChallenge.fragmentValue === null || fragmentChallenge.fragmentValue === undefined) {
    return res.status(500).json({ error: "This mission has no fragment configured." });
  }

  const expected = String(fragmentChallenge.fragmentValue);
  if (digit !== expected) {
    const WRONG_FRAGMENT_PENALTY = 20;
    await prisma.$transaction([
      prisma.teamMission.update({
        where: { teamId_missionId: { teamId, missionId: mission.id } },
        data: { fragmentAttempts: { increment: 1 } },
      }),
      prisma.team.update({
        where: { id: teamId },
        data: { score: { decrement: WRONG_FRAGMENT_PENALTY } },
      }),
      prisma.activityLog.create({
        data: {
          teamId,
          action: "WRONG_FRAGMENT",
          metadata: { missionOrder: mission.orderIndex, submitted: digit, cost: WRONG_FRAGMENT_PENALTY },
        },
      }),
    ]);
    return res.json({ correct: false, penalty: WRONG_FRAGMENT_PENALTY });
  }

  const awarded = await awardFragmentAndAdvance(teamId, mission.id);
  res.json({ correct: true, ...awarded });
}

export async function requestHint(req: Request, res: Response) {
  const teamId = teamIdOf(req);
  if (!teamId) return res.status(403).json({ error: "Player only" });
  const { challengeId } = req.body ?? {};
  if (typeof challengeId !== "string")
    return res.status(400).json({ error: "challengeId required" });

  // Read phase
  const [team, challenge] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId } }),
    prisma.challenge.findUnique({ where: { id: challengeId } }),
  ]);
  if (!team) return res.status(404).json({ error: "Team not found" });
  if (team.hintsUsed >= 2) return res.status(400).json({ error: "No hints left (max 2)" });
  if (!challenge) return res.status(404).json({ error: "Challenge not found" });

  const tm = await prisma.teamMission.findUnique({
    where: { teamId_missionId: { teamId, missionId: challenge.missionId } },
  });
  if (tm?.hintUsed) {
    return res.json({ hint: challenge.hintText, alreadyUsed: true });
  }

  // Batched writes (Neon-safe)
  await prisma.$transaction([
    prisma.teamMission.update({
      where: { teamId_missionId: { teamId, missionId: challenge.missionId } },
      data: { hintUsed: true },
    }),
    prisma.team.update({
      where: { id: teamId },
      data: {
        hintsUsed: { increment: 1 },
        score: { decrement: challenge.hintCost },
      },
    }),
    prisma.activityLog.create({
      data: {
        teamId,
        action: "HINT_USED",
        metadata: { challengeId: challenge.id, cost: challenge.hintCost },
      },
    }),
  ]);

  return res.json({ hint: challenge.hintText, cost: challenge.hintCost });
}

export async function listFragments(req: Request, res: Response) {
  const teamId = teamIdOf(req);
  if (!teamId) return res.status(403).json({ error: "Player only" });
  const frags = await prisma.teamFragment.findMany({
    where: { teamId },
    orderBy: { missionOrder: "asc" },
  });
  res.json(frags.map((f) => ({ value: f.value, missionOrder: f.missionOrder })));
}

const vaultSchema = z.object({ key: z.string().min(1).max(20) });

export async function submitVault(req: Request, res: Response) {
  const teamId = teamIdOf(req);
  if (!teamId) return res.status(403).json({ error: "Player only" });
  const parsed = vaultSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const cfg = await getConfig();
  if (cfg.gameStatus !== "RUNNING")
    return res.status(400).json({ error: "Game is not running" });

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return res.status(404).json({ error: "Team not found" });
  if (team.vaultUnlocked)
    return res.json({ success: true, alreadyUnlocked: true });

  if (team.vaultAttempts >= 3)
    return res.status(400).json({ error: "Max vault attempts reached" });

  const submitted = parsed.data.key.replace(/\s+/g, "");
  const correct = submitted === cfg.masterKey;

  if (!correct) {
    await prisma.team.update({
      where: { id: teamId },
      data: {
        vaultAttempts: { increment: 1 },
        score: { decrement: 20 },
      },
    });
    await prisma.activityLog.create({
      data: {
        teamId,
        action: "VAULT_ATTEMPT",
        metadata: { submitted, correct: false },
      },
    });
    return res.json({ success: false });
  }

  await prisma.team.update({
    where: { id: teamId },
    data: {
      vaultUnlocked: true,
      vaultUnlockedAt: new Date(),
      vaultAttempts: { increment: 1 },
      score: { increment: 200 },
    },
  });
  await prisma.activityLog.create({
    data: {
      teamId,
      action: "VAULT_SUCCESS",
      metadata: {},
    },
  });
  res.json({ success: true });
}

export async function publicLeaderboard(_req: Request, res: Response) {
  const teams = await prisma.team.findMany({
    orderBy: [{ score: "desc" }, { vaultUnlockedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      score: true,
      vaultUnlocked: true,
      vaultUnlockedAt: true,
      currentMission: true,
    },
  });
  res.json(teams);
}
