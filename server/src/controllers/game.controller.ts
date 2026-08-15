import { Request, Response } from "express";
import { z } from "zod";
import {
  prisma,
  getConfig,
  computeElapsed,
  ensureTeamMissions,
  answerMatches,
  normalize,
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
    include: { challenges: { orderBy: { orderInMission: "asc" } } },
  });

  if (!mission) {
    return res.json({ done: true, message: "All missions complete." });
  }

  const tm = await prisma.teamMission.findUnique({
    where: { teamId_missionId: { teamId, missionId: mission.id } },
  });

  const step = tm?.currentStep ?? 1;
  const challenge = mission.challenges.find((c) => c.orderInMission === step) ??
    mission.challenges[0];

  if (!challenge) return res.json({ done: false, mission: null });

  res.json({
    mission: {
      id: mission.id,
      orderIndex: mission.orderIndex,
      title: mission.title,
      type: mission.type,
      description: mission.description,
      briefingText: mission.briefingText,
      totalSteps: mission.challenges.length,
    },
    step,
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
    },
  });
}

const submitSchema = z.object({
  challengeId: z.string(),
  answer: z.string().min(1).max(200),
});

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
    include: { mission: true },
  });
  if (!challenge) return res.status(404).json({ error: "Challenge not found" });

  // Manual approval flow — INSIDER etc.
  if (challenge.answer === null) {
    return res.status(400).json({
      error: "This challenge requires senior verification. Show your code to a Tech Team member.",
      requiresManualApproval: true,
    });
  }

  const correct = answerMatches(challenge, parsed.data.answer);

  if (!correct) {
    await prisma.teamMission.update({
      where: { teamId_missionId: { teamId, missionId: challenge.missionId } },
      data: { wrongAttempts: { increment: 1 } },
    });
    await prisma.activityLog.create({
      data: {
        teamId,
        action: "WRONG_ANSWER",
        metadata: { challengeId: challenge.id, submitted: normalize(parsed.data.answer) },
      },
    });
    return res.status(200).json({ correct: false });
  }

  const result = await completeChallenge(teamId, challenge.id);
  res.json({ correct: true, ...result });
}

async function completeChallenge(teamId: string, challengeId: string) {
  return prisma.$transaction(async (tx) => {
    const challenge = await tx.challenge.findUnique({
      where: { id: challengeId },
      include: {
        mission: { include: { challenges: { orderBy: { orderInMission: "asc" } } } },
      },
    });
    if (!challenge) throw new Error("Challenge gone");

    const tm = await tx.teamMission.findUnique({
      where: { teamId_missionId: { teamId, missionId: challenge.missionId } },
    });
    if (!tm) throw new Error("Team mission missing");

    // idempotency: if this step is already past, no-op
    if (challenge.orderInMission < tm.currentStep && tm.status === "COMPLETED") {
      return { alreadyCompleted: true };
    }

    // award points
    let bonus = 0;
    // Award fragment
    let fragmentValue: number | null = null;
    if (challenge.fragmentValue !== null && challenge.fragmentValue !== undefined) {
      fragmentValue = challenge.fragmentValue;
      const existing = await tx.teamFragment.findUnique({
        where: { teamId_challengeId: { teamId, challengeId: challenge.id } },
      });
      if (!existing) {
        await tx.teamFragment.create({
          data: {
            teamId,
            challengeId: challenge.id,
            value: challenge.fragmentValue,
            missionOrder: challenge.mission.orderIndex,
          },
        });
      }
    }

    // Determine if this completes the whole mission
    const total = challenge.mission.challenges.length;
    const isFinalStep = challenge.orderInMission >= total;

    // Bonus for first team to finish this mission
    if (isFinalStep) {
      const priorCompletions = await tx.teamMission.count({
        where: { missionId: challenge.missionId, status: "COMPLETED" },
      });
      if (priorCompletions === 0) bonus = 20;
    }

    await tx.team.update({
      where: { id: teamId },
      data: { score: { increment: challenge.points + bonus } },
    });

    if (isFinalStep) {
      await tx.teamMission.update({
        where: { teamId_missionId: { teamId, missionId: challenge.missionId } },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          currentStep: total + 1,
        },
      });
      // Advance to next mission
      const nextMission = await tx.mission.findFirst({
        where: {
          isActive: true,
          orderIndex: { gt: challenge.mission.orderIndex, lt: 99 },
        },
        orderBy: { orderIndex: "asc" },
      });
      if (nextMission) {
        await tx.team.update({
          where: { id: teamId },
          data: { currentMission: nextMission.orderIndex },
        });
        await tx.teamMission.upsert({
          where: { teamId_missionId: { teamId, missionId: nextMission.id } },
          update: { status: "ACTIVE", startedAt: new Date() },
          create: {
            teamId,
            missionId: nextMission.id,
            status: "ACTIVE",
            startedAt: new Date(),
          },
        });
      } else {
        // No more missions — mark team ready for vault (currentMission stays; front-end shows vault)
        await tx.team.update({
          where: { id: teamId },
          data: { currentMission: challenge.mission.orderIndex + 1 },
        });
      }
      await tx.activityLog.create({
        data: {
          teamId,
          action: "MISSION_COMPLETED",
          metadata: { missionId: challenge.missionId, orderIndex: challenge.mission.orderIndex, bonus },
        },
      });
    } else {
      await tx.teamMission.update({
        where: { teamId_missionId: { teamId, missionId: challenge.missionId } },
        data: { currentStep: challenge.orderInMission + 1 },
      });
    }

    return {
      pointsAwarded: challenge.points + bonus,
      bonus,
      fragmentValue,
      missionCompleted: isFinalStep,
    };
  });
}

export async function requestHint(req: Request, res: Response) {
  const teamId = teamIdOf(req);
  if (!teamId) return res.status(403).json({ error: "Player only" });
  const { challengeId } = req.body ?? {};
  if (typeof challengeId !== "string")
    return res.status(400).json({ error: "challengeId required" });

  return prisma.$transaction(async (tx) => {
    const team = await tx.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: "Team not found" });
    if (team.hintsUsed >= 2)
      return res.status(400).json({ error: "No hints left (max 2)" });

    const challenge = await tx.challenge.findUnique({ where: { id: challengeId } });
    if (!challenge) return res.status(404).json({ error: "Challenge not found" });

    const tm = await tx.teamMission.findUnique({
      where: { teamId_missionId: { teamId, missionId: challenge.missionId } },
    });
    if (tm?.hintUsed) {
      return res.json({ hint: challenge.hintText, alreadyUsed: true });
    }

    await tx.teamMission.update({
      where: { teamId_missionId: { teamId, missionId: challenge.missionId } },
      data: { hintUsed: true },
    });
    await tx.team.update({
      where: { id: teamId },
      data: {
        hintsUsed: { increment: 1 },
        score: { decrement: challenge.hintCost },
      },
    });
    await tx.activityLog.create({
      data: {
        teamId,
        action: "HINT_USED",
        metadata: { challengeId: challenge.id, cost: challenge.hintCost },
      },
    });

    return res.json({ hint: challenge.hintText, cost: challenge.hintCost });
  });
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
