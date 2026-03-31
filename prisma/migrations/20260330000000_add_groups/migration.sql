-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

-- Seed the default group for existing data
INSERT INTO "Group" ("id", "name", "createdAt")
VALUES ('default-group-friendz', 'FRIENDZ', CURRENT_TIMESTAMP);

-- Add groupId columns (nullable first so we can backfill)
ALTER TABLE "Player" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Session" ADD COLUMN "groupId" TEXT;

-- Backfill all existing rows into the FRIENDZ group
UPDATE "Player" SET "groupId" = 'default-group-friendz' WHERE "groupId" IS NULL;
UPDATE "Session" SET "groupId" = 'default-group-friendz' WHERE "groupId" IS NULL;

-- Now make groupId required
ALTER TABLE "Player" ALTER COLUMN "groupId" SET NOT NULL;
ALTER TABLE "Session" ALTER COLUMN "groupId" SET NOT NULL;

-- Add foreign keys
ALTER TABLE "Player" ADD CONSTRAINT "Player_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session" ADD CONSTRAINT "Session_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add indexes for performance
CREATE INDEX "Player_groupId_idx" ON "Player"("groupId");
CREATE INDEX "Session_groupId_idx" ON "Session"("groupId");
