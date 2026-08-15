import { Request, Response } from "express";
import { prisma, getConfig, computeElapsed } from "../services/game.service.js";

const BREACH_WINDOW_MS = 10_000;

export async function projectorState(_req: Request, res: Response) {
  const cfg = await getConfig();
  const elapsed = computeElapsed(cfg);
  const remaining = Math.max(0, cfg.totalTime - elapsed);

  const teams = await prisma.team.findMany({
    orderBy: [{ score: "desc" }, { vaultUnlockedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      score: true,
      currentMission: true,
      vaultUnlocked: true,
      vaultUnlockedAt: true,
    },
  });

  // Detect a live vault-breach event: any team unlocked in the last 10s
  const now = Date.now();
  const breach = teams.find(
    (t) =>
      t.vaultUnlocked &&
      t.vaultUnlockedAt &&
      now - t.vaultUnlockedAt.getTime() < BREACH_WINDOW_MS,
  );

  const techTeam = await prisma.techTeamMember.findMany({ orderBy: { order: "asc" } });

  res.json({
    gameName: cfg.gameName,
    status: cfg.gameStatus,
    totalTime: cfg.totalTime,
    elapsed,
    remaining,
    leaderboard: teams.map((t, i) => ({
      rank: i + 1,
      id: t.id,
      name: t.name,
      score: t.score,
      currentMission: t.currentMission,
      vaultUnlocked: t.vaultUnlocked,
    })),
    breach: breach
      ? {
          teamId: breach.id,
          teamName: breach.name,
          unlockedAt: breach.vaultUnlockedAt,
          ageMs: now - (breach.vaultUnlockedAt?.getTime() ?? now),
        }
      : null,
    techTeam,
  });
}
