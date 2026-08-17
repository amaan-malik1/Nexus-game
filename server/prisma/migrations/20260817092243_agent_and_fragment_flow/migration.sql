-- AlterEnum
ALTER TYPE "TeamMissionStatus" ADD VALUE 'AWAITING_FRAGMENT';

-- AlterTable
ALTER TABLE "Mission" ADD COLUMN     "agentClueText" TEXT,
ADD COLUMN     "agentMemberId" TEXT;

-- AlterTable
ALTER TABLE "TeamMission" ADD COLUMN     "fragmentAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "puzzleSolvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TechTeamMember" ADD COLUMN     "agentCallsign" TEXT;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_agentMemberId_fkey" FOREIGN KEY ("agentMemberId") REFERENCES "TechTeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
