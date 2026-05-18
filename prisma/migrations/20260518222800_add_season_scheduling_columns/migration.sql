-- Add scheduling metadata for announced future seasons
ALTER TABLE "Season"
ADD COLUMN "scheduledStartAt" TIMESTAMP(3),
ADD COLUMN "announcedAt" TIMESTAMP(3);
