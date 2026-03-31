-- CreateIndex
CREATE INDEX "Game_sessionId_idx" ON "Game"("sessionId");

-- CreateIndex
CREATE INDEX "RatingHistory_playerId_idx" ON "RatingHistory"("playerId");

-- CreateIndex
CREATE INDEX "RatingHistory_sessionId_idx" ON "RatingHistory"("sessionId");
