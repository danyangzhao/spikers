-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonStanding" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "finalRating" INTEGER NOT NULL,
    "gamesPlayed" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "pointsFor" INTEGER NOT NULL,
    "pointsAgainst" INTEGER NOT NULL,
    "longestWinStreak" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "SeasonStanding_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "PlayerBadge" ADD COLUMN "seasonId" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "seasonId" TEXT;

-- Seed Season 1 for every group
INSERT INTO "Season" ("id", "groupId", "name", "number", "startedAt", "isActive")
SELECT
  CONCAT('season1-', "id"),
  "id",
  'Season 1',
  1,
  CURRENT_TIMESTAMP,
  true
FROM "Group";

-- Backfill existing sessions into Season 1 for their group
UPDATE "Session" s
SET "seasonId" = se."id"
FROM "Season" se
WHERE se."groupId" = s."groupId"
  AND se."number" = 1
  AND s."seasonId" IS NULL;

-- Backfill existing earned badges into Season 1 for each player's group
UPDATE "PlayerBadge" pb
SET "seasonId" = se."id"
FROM "Player" p
JOIN "Season" se
  ON se."groupId" = p."groupId"
 AND se."number" = 1
WHERE pb."playerId" = p."id"
  AND pb."seasonId" IS NULL;

-- Set new columns required
ALTER TABLE "PlayerBadge" ALTER COLUMN "seasonId" SET NOT NULL;
ALTER TABLE "Session" ALTER COLUMN "seasonId" SET NOT NULL;

-- Update uniqueness for season-scoped badges
DROP INDEX "PlayerBadge_playerId_badgeId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Season_groupId_number_key" ON "Season"("groupId", "number");
CREATE INDEX "Season_groupId_isActive_idx" ON "Season"("groupId", "isActive");
CREATE UNIQUE INDEX "SeasonStanding_seasonId_playerId_key" ON "SeasonStanding"("seasonId", "playerId");
CREATE INDEX "SeasonStanding_seasonId_idx" ON "SeasonStanding"("seasonId");
CREATE INDEX "PlayerBadge_seasonId_idx" ON "PlayerBadge"("seasonId");
CREATE UNIQUE INDEX "PlayerBadge_playerId_badgeId_seasonId_key" ON "PlayerBadge"("playerId", "badgeId", "seasonId");
CREATE INDEX "Session_seasonId_idx" ON "Session"("seasonId");

-- AddForeignKey
ALTER TABLE "Season"
ADD CONSTRAINT "Season_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "Group"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session"
ADD CONSTRAINT "Session_seasonId_fkey"
FOREIGN KEY ("seasonId") REFERENCES "Season"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeasonStanding"
ADD CONSTRAINT "SeasonStanding_seasonId_fkey"
FOREIGN KEY ("seasonId") REFERENCES "Season"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeasonStanding"
ADD CONSTRAINT "SeasonStanding_playerId_fkey"
FOREIGN KEY ("playerId") REFERENCES "Player"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerBadge"
ADD CONSTRAINT "PlayerBadge_seasonId_fkey"
FOREIGN KEY ("seasonId") REFERENCES "Season"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
