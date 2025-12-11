/**
 * ELO Rating System for Spikers
 * 
 * Each player starts at 1000 rating.
 * Team ratings are averaged from player ratings.
 * Winners gain points, losers lose points based on expected outcome.
 */

// K-factor determines how much ratings change per game
// Higher K = more volatile ratings
const K_FACTOR = 20

interface PlayerRating {
  id: string
  rating: number
}

interface RatingUpdate {
  playerId: string
  ratingBefore: number
  ratingAfter: number
  change: number
}

/**
 * Calculate the expected score for a team
 * Based on the ELO formula: E = 1 / (1 + 10^((Rb - Ra) / 400))
 * 
 * @param teamRating - Average rating of the team
 * @param opponentRating - Average rating of the opponent team
 * @returns Expected score (0 to 1)
 */
export function calculateExpectedScore(
  teamRating: number,
  opponentRating: number
): number {
  return 1 / (1 + Math.pow(10, (opponentRating - teamRating) / 400))
}

/**
 * Calculate the average rating of a team
 */
export function getTeamAverageRating(players: PlayerRating[]): number {
  if (players.length === 0) return 1000
  return players.reduce((sum, p) => sum + p.rating, 0) / players.length
}

/**
 * Calculate ELO updates for all players after a game
 * 
 * @param teamA - Players on team A with their current ratings
 * @param teamB - Players on team B with their current ratings
 * @param winner - Which team won ('A' or 'B')
 * @returns Rating updates for all players
 */
export function calculateEloUpdates(
  teamA: PlayerRating[],
  teamB: PlayerRating[],
  winner: 'A' | 'B'
): {
  teamAUpdates: RatingUpdate[]
  teamBUpdates: RatingUpdate[]
} {
  // Calculate team average ratings
  const ratingTeamA = getTeamAverageRating(teamA)
  const ratingTeamB = getTeamAverageRating(teamB)

  // Calculate expected scores
  const expectedA = calculateExpectedScore(ratingTeamA, ratingTeamB)
  const expectedB = 1 - expectedA

  // Actual scores (1 for win, 0 for loss)
  const actualA = winner === 'A' ? 1 : 0
  const actualB = 1 - actualA

  // Calculate rating changes
  const deltaA = K_FACTOR * (actualA - expectedA)
  const deltaB = K_FACTOR * (actualB - expectedB)

  // Apply to each player
  const teamAUpdates: RatingUpdate[] = teamA.map((player) => ({
    playerId: player.id,
    ratingBefore: player.rating,
    ratingAfter: Math.round(player.rating + deltaA),
    change: Math.round(deltaA),
  }))

  const teamBUpdates: RatingUpdate[] = teamB.map((player) => ({
    playerId: player.id,
    ratingBefore: player.rating,
    ratingAfter: Math.round(player.rating + deltaB),
    change: Math.round(deltaB),
  }))

  return { teamAUpdates, teamBUpdates }
}

/**
 * Determine winner from scores
 */
export function getWinner(scoreA: number, scoreB: number): 'A' | 'B' {
  return scoreA > scoreB ? 'A' : 'B'
}

/**
 * Calculate upset probability
 * Returns how surprising a win was (higher = bigger upset)
 * 
 * @param winnerRating - Average rating of winning team
 * @param loserRating - Average rating of losing team
 * @returns Upset factor (0 to 1, where 1 is maximum upset)
 */
export function calculateUpsetFactor(
  winnerRating: number,
  loserRating: number
): number {
  // If the winner was expected to win, not an upset
  if (winnerRating >= loserRating) return 0
  
  // Calculate how unexpected the win was
  const expectedWinnerScore = calculateExpectedScore(winnerRating, loserRating)
  return 1 - expectedWinnerScore
}

