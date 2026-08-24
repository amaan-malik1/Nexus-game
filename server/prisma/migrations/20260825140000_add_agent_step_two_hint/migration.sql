ALTER TABLE "Mission" ADD COLUMN "agentHintText" TEXT;

ALTER TABLE "TeamMission" ADD COLUMN "agentHintUsed" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Mission"
SET "agentHintText" = COALESCE("agentHintText", "agentClueText", "agentAbout", "agentAppearance", "agentLocation")
WHERE "agentHintText" IS NULL;