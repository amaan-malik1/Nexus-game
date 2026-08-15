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
