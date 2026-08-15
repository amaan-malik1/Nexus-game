-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PLAYER');

-- CreateEnum
CREATE TYPE "MissionType" AS ENUM ('CIPHER', 'PROTOCOL', 'DATA_CORRUPTION', 'LOGIC_LOCK', 'INSIDER');

-- CreateEnum
CREATE TYPE "TeamMissionStatus" AS ENUM ('LOCKED', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('NOT_STARTED', 'RUNNING', 'PAUSED', 'FINISHED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 100,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "currentMission" INTEGER NOT NULL DEFAULT 1,
    "vaultUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "vaultUnlockedAt" TIMESTAMP(3),
    "vaultAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "type" "MissionType" NOT NULL,
    "description" TEXT NOT NULL,
    "briefingText" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "questionData" JSONB NOT NULL,
    "answer" TEXT,
    "fragmentValue" INTEGER,
    "points" INTEGER NOT NULL DEFAULT 50,
    "hintText" TEXT,
    "hintCost" INTEGER NOT NULL DEFAULT 10,
    "orderInMission" INTEGER NOT NULL DEFAULT 1,
    "isAlternate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMission" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "status" "TeamMissionStatus" NOT NULL DEFAULT 'LOCKED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "hintUsed" BOOLEAN NOT NULL DEFAULT false,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "wrongAttempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TeamMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamFragment" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "missionOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamFragment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "gameName" TEXT NOT NULL DEFAULT 'NEXUS',
    "totalTime" INTEGER NOT NULL DEFAULT 1800,
    "gameStatus" "GameStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "elapsedBeforePause" INTEGER NOT NULL DEFAULT 0,
    "masterKey" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "GameConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "teamId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechTeamMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "photoUrl" TEXT,
    "bio" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TechTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Team_code_key" ON "Team"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Mission_orderIndex_key" ON "Mission"("orderIndex");

-- CreateIndex
CREATE INDEX "Challenge_missionId_orderInMission_idx" ON "Challenge"("missionId", "orderInMission");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMission_teamId_missionId_key" ON "TeamMission"("teamId", "missionId");

-- CreateIndex
CREATE INDEX "TeamFragment_teamId_missionOrder_idx" ON "TeamFragment"("teamId", "missionOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TeamFragment_teamId_challengeId_key" ON "TeamFragment"("teamId", "challengeId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMission" ADD CONSTRAINT "TeamMission_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMission" ADD CONSTRAINT "TeamMission_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamFragment" ADD CONSTRAINT "TeamFragment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamFragment" ADD CONSTRAINT "TeamFragment_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
