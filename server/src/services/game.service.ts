import { PrismaClient, TeamMissionStatus, GameStatus } from "@prisma/client";

export const prisma = new PrismaClient();

export function generateTeamCode(): string {
  // 6 chars, unambiguous set (no 0/O/1/I)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export async function getConfig() {
  return prisma.gameConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", masterKey: "" },
  });
}

export async function recomputeMasterKey(): Promise<string> {
  const missions = await prisma.mission.findMany({
    where: { isActive: true, orderIndex: { lt: 99 } },
    orderBy: { orderIndex: "asc" },
    include: { challenges: { orderBy: { orderInMission: "asc" } } },
  });
  let key = "";
  for (const m of missions) {
    for (const c of m.challenges) {
      if (c.fragmentValue !== null && c.fragmentValue !== undefined) {
        key += String(c.fragmentValue);
      }
    }
  }
  await prisma.gameConfig.update({ where: { id: "singleton" }, data: { masterKey: key } });
  return key;
}

export function computeElapsed(config: {
  gameStatus: GameStatus;
  startedAt: Date | null;
  pausedAt: Date | null;
  elapsedBeforePause: number;
}): number {
  if (config.gameStatus === "NOT_STARTED") return 0;
  if (config.gameStatus === "PAUSED") return config.elapsedBeforePause;
  if (!config.startedAt) return config.elapsedBeforePause;
  const now = Date.now();
  const start = config.startedAt.getTime();
  return config.elapsedBeforePause + Math.floor((now - start) / 1000);
}

/**
 * Ensure a team has TeamMission rows for every active real mission (orderIndex < 99).
 * Mission 1 becomes ACTIVE, others LOCKED — unless further along already.
 */
export async function ensureTeamMissions(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) return;
  const missions = await prisma.mission.findMany({
    where: { isActive: true, orderIndex: { lt: 99 } },
    orderBy: { orderIndex: "asc" },
  });
  for (const m of missions) {
    await prisma.teamMission.upsert({
      where: { teamId_missionId: { teamId, missionId: m.id } },
      update: {},
      create: {
        teamId,
        missionId: m.id,
        status:
          m.orderIndex === team.currentMission
            ? TeamMissionStatus.ACTIVE
            : m.orderIndex < team.currentMission
              ? TeamMissionStatus.COMPLETED
              : TeamMissionStatus.LOCKED,
        startedAt: m.orderIndex === team.currentMission ? new Date() : null,
      },
    });
  }
}

export function normalize(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, " ");
}

export function answerMatches(challenge: { answer: string | null; questionData: any }, submitted: string): boolean {
  if (challenge.answer === null || challenge.answer === undefined) return false;
  const norm = normalize(submitted);
  if (normalize(challenge.answer) === norm) return true;
  const accepts: string[] | undefined = challenge.questionData?.accepts;
  if (Array.isArray(accepts) && accepts.some((a) => normalize(a) === norm)) return true;
  return false;
}

/**
 * Award the fragment for a mission and advance the team.
 * Idempotent: if already awarded, does nothing.
 * Bonus: first team to finish a mission gets +20.
 * Used by both /api/game/fragment (player-entered digit) and /api/admin/.../verify-fragment (staff override).
 */
export async function awardFragmentAndAdvance(
  teamId: string,
  missionId: string,
): Promise<{
  alreadyCompleted: boolean;
  pointsAwarded: number;
  bonus: number;
  fragmentValue: number | null;
  missionOrder: number;
}> {
  return prisma.$transaction(async (tx) => {
    const mission = await tx.mission.findUnique({
      where: { id: missionId },
      include: { challenges: { orderBy: { orderInMission: "asc" } } },
    });
    if (!mission) throw new Error("Mission not found");

    // The fragment-bearing challenge is the last one with a fragmentValue set;
    // typically the final step of the mission.
    const fragmentChallenge =
      [...mission.challenges].reverse().find((c) => c.fragmentValue !== null && c.fragmentValue !== undefined) ??
      mission.challenges[mission.challenges.length - 1];
    if (!fragmentChallenge) throw new Error("Mission has no challenges");

    const tm = await tx.teamMission.findUnique({
      where: { teamId_missionId: { teamId, missionId } },
    });
    if (!tm) throw new Error("Team mission missing");
    if (tm.status === "COMPLETED") {
      return {
        alreadyCompleted: true,
        pointsAwarded: 0,
        bonus: 0,
        fragmentValue: fragmentChallenge.fragmentValue ?? null,
        missionOrder: mission.orderIndex,
      };
    }

    if (fragmentChallenge.fragmentValue !== null && fragmentChallenge.fragmentValue !== undefined) {
      const existing = await tx.teamFragment.findUnique({
        where: { teamId_challengeId: { teamId, challengeId: fragmentChallenge.id } },
      });
      if (!existing) {
        await tx.teamFragment.create({
          data: {
            teamId,
            challengeId: fragmentChallenge.id,
            value: fragmentChallenge.fragmentValue,
            missionOrder: mission.orderIndex,
          },
        });
      }
    }

    const priorCompletions = await tx.teamMission.count({
      where: { missionId, status: "COMPLETED" },
    });
    const FRAGMENT_POINTS = 50;
    const bonus = priorCompletions === 0 ? 20 : 0;

    await tx.team.update({
      where: { id: teamId },
      data: { score: { increment: FRAGMENT_POINTS + bonus } },
    });

    await tx.teamMission.update({
      where: { teamId_missionId: { teamId, missionId } },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        currentStep: mission.challenges.length + 1,
      },
    });

    const next = await tx.mission.findFirst({
      where: { isActive: true, orderIndex: { gt: mission.orderIndex, lt: 99 } },
      orderBy: { orderIndex: "asc" },
    });
    if (next) {
      await tx.team.update({ where: { id: teamId }, data: { currentMission: next.orderIndex } });
      await tx.teamMission.upsert({
        where: { teamId_missionId: { teamId, missionId: next.id } },
        update: { status: "ACTIVE", startedAt: new Date() },
        create: { teamId, missionId: next.id, status: "ACTIVE", startedAt: new Date() },
      });
    } else {
      await tx.team.update({
        where: { id: teamId },
        data: { currentMission: mission.orderIndex + 1 },
      });
    }

    await tx.activityLog.create({
      data: {
        teamId,
        action: "FRAGMENT_AWARDED",
        metadata: { missionId, orderIndex: mission.orderIndex, bonus },
      },
    });

    return {
      alreadyCompleted: false,
      pointsAwarded: FRAGMENT_POINTS + bonus,
      bonus,
      fragmentValue: fragmentChallenge.fragmentValue ?? null,
      missionOrder: mission.orderIndex,
    };
  });
}
