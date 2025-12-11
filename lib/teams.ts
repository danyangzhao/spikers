/**
 * Team generation utilities for Spikers
 * Handles random team creation for 2v2 Spikeball games
 */

/**
 * Fisher-Yates shuffle algorithm
 * Creates a random permutation of the array
 */
export function shuffle<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Generate random 2-person teams from a list of player IDs
 * 
 * @param playerIds - Array of player IDs to divide into teams
 * @param teamSize - Number of players per team (default 2)
 * @returns Object with teams array and any leftover players
 */
export function generateRandomTeams(
  playerIds: string[],
  teamSize: number = 2
): { teams: string[][]; leftover: string[] } {
  const shuffled = shuffle(playerIds)
  const teams: string[][] = []

  // Create teams of the specified size
  for (let i = 0; i + teamSize <= shuffled.length; i += teamSize) {
    teams.push(shuffled.slice(i, i + teamSize))
  }

  // Handle any leftover players (odd number)
  const remainder = shuffled.length % teamSize
  const leftover = remainder === 0 
    ? [] 
    : shuffled.slice(shuffled.length - remainder)

  return { teams, leftover }
}

/**
 * Generate a single game matchup (2 teams for a 2v2 game)
 * 
 * @param playerIds - Array of player IDs (should be at least 4)
 * @returns Object with teamA, teamB, and any bench players
 */
export function generateGameMatchup(playerIds: string[]): {
  teamA: string[]
  teamB: string[]
  bench: string[]
} {
  if (playerIds.length < 4) {
    throw new Error('Need at least 4 players to generate a game matchup')
  }

  const { teams, leftover } = generateRandomTeams(playerIds, 2)
  
  return {
    teamA: teams[0] || [],
    teamB: teams[1] || [],
    bench: [...(teams.slice(2).flat()), ...leftover],
  }
}

