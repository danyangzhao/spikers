/**
 * Stats computation utilities for Spikers
 * Calculates partner chemistry, nemesis opponents, awards, and badges
 */

import { prisma } from './prisma'

// Types for stats computation
interface PartnerStat {
  partnerId: string
  partnerName: string
  partnerEmoji: string
  gamesPlayed: number
  wins: number
  winRate: number
}

interface NemesisStat {
  opponentIds: string[]
  opponentNames: string[]
  opponentEmojis: string[]
  gamesPlayed: number
  wins: number
  winRate: number
}

interface PlayerSessionStats {
  gamesPlayed: number
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  uniqueTeammates: Set<string>
  closeGameWins: number
  currentStreak: number
  maxStreak: number
}

// Minimum games threshold for stats
const MIN_GAMES_THRESHOLD = 3

/**
 * Get partner chemistry stats for a player
 * Shows which teammates they win most often with
 */
export async function getPartnerChemistry(
  playerId: string,
  limit: number = 3
): Promise<PartnerStat[]> {
  // Get all games where this player participated
  const games = await prisma.game.findMany({
    where: {
      OR: [
        { teamAPlayers: { some: { id: playerId } } },
        { teamBPlayers: { some: { id: playerId } } },
      ],
    },
    include: {
      teamAPlayers: true,
      teamBPlayers: true,
    },
  })

  // Track stats per partner
  const partnerStats = new Map<string, { games: number; wins: number; name: string; emoji: string }>()

  for (const game of games) {
    const isTeamA = game.teamAPlayers.some((p) => p.id === playerId)
    const myTeam = isTeamA ? game.teamAPlayers : game.teamBPlayers
    const didWin = isTeamA ? game.scoreA > game.scoreB : game.scoreB > game.scoreA

    // Find teammates (excluding self)
    for (const teammate of myTeam) {
      if (teammate.id === playerId) continue

      const existing = partnerStats.get(teammate.id) || {
        games: 0,
        wins: 0,
        name: teammate.name,
        emoji: teammate.emoji,
      }
      existing.games++
      if (didWin) existing.wins++
      partnerStats.set(teammate.id, existing)
    }
  }

  // Convert to array and filter by threshold
  const results: PartnerStat[] = []
  for (const [partnerId, stats] of partnerStats) {
    if (stats.games >= MIN_GAMES_THRESHOLD) {
      results.push({
        partnerId,
        partnerName: stats.name,
        partnerEmoji: stats.emoji,
        gamesPlayed: stats.games,
        wins: stats.wins,
        winRate: stats.wins / stats.games,
      })
    }
  }

  // Sort by win rate descending
  results.sort((a, b) => b.winRate - a.winRate)
  return results.slice(0, limit)
}

/**
 * Get nemesis stats for a player
 * Shows opponent pairs they struggle against most
 */
export async function getNemesisOpponents(
  playerId: string,
  limit: number = 3
): Promise<NemesisStat[]> {
  // Get all games where this player participated
  const games = await prisma.game.findMany({
    where: {
      OR: [
        { teamAPlayers: { some: { id: playerId } } },
        { teamBPlayers: { some: { id: playerId } } },
      ],
    },
    include: {
      teamAPlayers: true,
      teamBPlayers: true,
    },
  })

  // Track stats per opponent pair (sorted IDs as key)
  const opponentStats = new Map<
    string,
    { games: number; wins: number; opponents: { id: string; name: string; emoji: string }[] }
  >()

  for (const game of games) {
    const isTeamA = game.teamAPlayers.some((p) => p.id === playerId)
    const opponents = isTeamA ? game.teamBPlayers : game.teamAPlayers
    const didWin = isTeamA ? game.scoreA > game.scoreB : game.scoreB > game.scoreA

    // Create a key from sorted opponent IDs
    const opponentIds = opponents.map((p) => p.id).sort()
    const key = opponentIds.join('-')

    const existing = opponentStats.get(key) || {
      games: 0,
      wins: 0,
      opponents: opponents.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
    }
    existing.games++
    if (didWin) existing.wins++
    opponentStats.set(key, existing)
  }

  // Convert to array and filter by threshold
  const results: NemesisStat[] = []
  for (const [, stats] of opponentStats) {
    if (stats.games >= MIN_GAMES_THRESHOLD) {
      results.push({
        opponentIds: stats.opponents.map((o) => o.id),
        opponentNames: stats.opponents.map((o) => o.name),
        opponentEmojis: stats.opponents.map((o) => o.emoji),
        gamesPlayed: stats.games,
        wins: stats.wins,
        winRate: stats.wins / stats.games,
      })
    }
  }

  // Sort by win rate ascending (worst matchups first)
  results.sort((a, b) => a.winRate - b.winRate)
  return results.slice(0, limit)
}

/**
 * Get lifetime stats for a player
 */
export async function getPlayerLifetimeStats(playerId: string) {
  // Get all games ordered by creation time for streak tracking
  const games = await prisma.game.findMany({
    where: {
      OR: [
        { teamAPlayers: { some: { id: playerId } } },
        { teamBPlayers: { some: { id: playerId } } },
      ],
    },
    include: {
      teamAPlayers: true,
      teamBPlayers: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  // Get attendance
  const attendances = await prisma.attendance.findMany({
    where: { playerId, present: true },
  })

  let wins = 0
  let losses = 0
  let pointsFor = 0
  let pointsAgainst = 0

  // New stats tracking
  let currentWinStreak = 0
  let longestWinStreak = 0
  let closeGameWins = 0
  let closeGameLosses = 0
  let blowoutWins = 0
  let blowoutLosses = 0
  let totalMarginOfVictory = 0
  let totalMarginOfDefeat = 0

  for (const game of games) {
    const isTeamA = game.teamAPlayers.some((p) => p.id === playerId)
    const myScore = isTeamA ? game.scoreA : game.scoreB
    const theirScore = isTeamA ? game.scoreB : game.scoreA
    const margin = Math.abs(myScore - theirScore)
    const isCloseGame = margin <= 2
    const isBlowout = margin >= 5

    pointsFor += myScore
    pointsAgainst += theirScore

    if (myScore > theirScore) {
      wins++
      currentWinStreak++
      if (currentWinStreak > longestWinStreak) longestWinStreak = currentWinStreak
      if (isCloseGame) closeGameWins++
      if (isBlowout) blowoutWins++
      totalMarginOfVictory += margin
    } else {
      losses++
      currentWinStreak = 0
      if (isCloseGame) closeGameLosses++
      if (isBlowout) blowoutLosses++
      totalMarginOfDefeat += margin
    }
  }

  const gamesPlayed = games.length
  const sessionsAttended = attendances.length
  const winRate = gamesPlayed > 0 ? wins / gamesPlayed : 0
  const avgPointDiff = gamesPlayed > 0 ? (pointsFor - pointsAgainst) / gamesPlayed : 0
  const avgMarginOfVictory = wins > 0 ? totalMarginOfVictory / wins : 0
  const avgMarginOfDefeat = losses > 0 ? totalMarginOfDefeat / losses : 0
  const pointsPerGame = gamesPlayed > 0 ? pointsFor / gamesPlayed : 0

  return {
    gamesPlayed,
    wins,
    losses,
    winRate,
    pointsFor,
    pointsAgainst,
    avgPointDiff,
    sessionsAttended,
    currentWinStreak,
    longestWinStreak,
    closeGameWins,
    closeGameLosses,
    blowoutWins,
    blowoutLosses,
    avgMarginOfVictory,
    avgMarginOfDefeat,
    pointsPerGame,
  }
}

/**
 * Calculate session awards
 */
export async function getSessionAwards(sessionId: string) {
  const games = await prisma.game.findMany({
    where: { sessionId },
    include: {
      teamAPlayers: true,
      teamBPlayers: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  if (games.length === 0) {
    return null
  }

  // Track stats per player
  const playerStats = new Map<string, PlayerSessionStats & { name: string; emoji: string }>()

  // Helper to initialize a player's stats
  const getOrCreateStats = (playerId: string, name: string, emoji: string) => {
    const existing = playerStats.get(playerId)
    if (existing) return existing
    const stats: PlayerSessionStats & { name: string; emoji: string } = {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      uniqueTeammates: new Set<string>(),
      closeGameWins: 0,
      currentStreak: 0,
      maxStreak: 0,
      name,
      emoji,
    }
    playerStats.set(playerId, stats)
    return stats
  }

  for (const game of games) {
    const teamAWon = game.scoreA > game.scoreB
    const margin = Math.abs(game.scoreA - game.scoreB)
    const isCloseGame = margin <= 2

    // Process team A
    for (const player of game.teamAPlayers) {
      const stats = getOrCreateStats(player.id, player.name, player.emoji)
      stats.gamesPlayed++
      if (teamAWon) {
        stats.wins++
        if (isCloseGame) stats.closeGameWins++
        stats.currentStreak++
        if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak
      } else {
        stats.losses++
        stats.currentStreak = 0
      }
      stats.pointsFor += game.scoreA
      stats.pointsAgainst += game.scoreB
      game.teamAPlayers.forEach((t) => {
        if (t.id !== player.id) stats.uniqueTeammates.add(t.id)
      })
    }

    // Process team B
    for (const player of game.teamBPlayers) {
      const stats = getOrCreateStats(player.id, player.name, player.emoji)
      stats.gamesPlayed++
      if (!teamAWon) {
        stats.wins++
        if (isCloseGame) stats.closeGameWins++
        stats.currentStreak++
        if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak
      } else {
        stats.losses++
        stats.currentStreak = 0
      }
      stats.pointsFor += game.scoreB
      stats.pointsAgainst += game.scoreA
      game.teamBPlayers.forEach((t) => {
        if (t.id !== player.id) stats.uniqueTeammates.add(t.id)
      })
    }
  }

  const players = Array.from(playerStats.entries()).map(([id, stats]) => ({
    id,
    ...stats,
    uniqueTeammatesCount: stats.uniqueTeammates.size,
  }))

  // Player of the Day: most wins (tiebreaker: best point diff)
  const playerOfTheDay = players
    .filter((p) => p.gamesPlayed >= 2)
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)
    })[0]

  // Ironman: most games played
  const ironman = players
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed)[0]

  // Social Butterfly: most unique teammates
  const socialButterfly = players
    .sort((a, b) => b.uniqueTeammatesCount - a.uniqueTeammatesCount)[0]

  // Clutch Player: most wins in close games (margin <= 2), min 2 close game wins
  const clutchPlayer = players
    .filter((p) => p.closeGameWins >= 2)
    .sort((a, b) => b.closeGameWins - a.closeGameWins)[0]

  // The Wall: lowest avg points against per game (min 2 games)
  const theWall = players
    .filter((p) => p.gamesPlayed >= 2)
    .sort((a, b) => (a.pointsAgainst / a.gamesPlayed) - (b.pointsAgainst / b.gamesPlayed))[0]

  // Hot Streak: longest consecutive win streak in the session
  const hotStreak = players
    .filter((p) => p.maxStreak >= 2)
    .sort((a, b) => b.maxStreak - a.maxStreak)[0]

  // Game spotlights
  const gameMargins = games.map((g, i) => ({
    gameNumber: i + 1,
    scoreA: g.scoreA,
    scoreB: g.scoreB,
    margin: Math.abs(g.scoreA - g.scoreB),
  }))
  const closestGame = [...gameMargins].sort((a, b) => a.margin - b.margin)[0]
  const biggestBlowout = [...gameMargins].sort((a, b) => b.margin - a.margin)[0]

  // Auto-generated highlights
  const highlights: string[] = []
  for (const p of players) {
    if (p.gamesPlayed >= 3 && p.wins === p.gamesPlayed) {
      highlights.push(`${p.name} went ${p.wins}-0!`)
    }
  }
  if (closestGame && closestGame.margin <= 2) {
    highlights.push(
      `Closest game: ${closestGame.scoreA}-${closestGame.scoreB} in Game ${closestGame.gameNumber}`
    )
  }
  if (biggestBlowout && biggestBlowout.margin >= 5) {
    highlights.push(
      `Biggest blowout: ${biggestBlowout.scoreA}-${biggestBlowout.scoreB} in Game ${biggestBlowout.gameNumber}`
    )
  }

  return {
    totalGames: games.length,
    playerOfTheDay: playerOfTheDay
      ? { id: playerOfTheDay.id, name: playerOfTheDay.name, emoji: playerOfTheDay.emoji, wins: playerOfTheDay.wins }
      : null,
    ironman: ironman
      ? { id: ironman.id, name: ironman.name, emoji: ironman.emoji, gamesPlayed: ironman.gamesPlayed }
      : null,
    socialButterfly: socialButterfly && socialButterfly.uniqueTeammatesCount >= 3
      ? { id: socialButterfly.id, name: socialButterfly.name, emoji: socialButterfly.emoji, uniqueTeammates: socialButterfly.uniqueTeammatesCount }
      : null,
    clutchPlayer: clutchPlayer
      ? { id: clutchPlayer.id, name: clutchPlayer.name, emoji: clutchPlayer.emoji, closeGameWins: clutchPlayer.closeGameWins }
      : null,
    theWall: theWall
      ? { id: theWall.id, name: theWall.name, emoji: theWall.emoji, avgPointsAgainst: Math.round((theWall.pointsAgainst / theWall.gamesPlayed) * 10) / 10 }
      : null,
    hotStreak: hotStreak
      ? { id: hotStreak.id, name: hotStreak.name, emoji: hotStreak.emoji, streak: hotStreak.maxStreak }
      : null,
    closestGame: closestGame
      ? { gameNumber: closestGame.gameNumber, scoreA: closestGame.scoreA, scoreB: closestGame.scoreB }
      : null,
    biggestBlowout: biggestBlowout && biggestBlowout.margin >= 3
      ? { gameNumber: biggestBlowout.gameNumber, scoreA: biggestBlowout.scoreA, scoreB: biggestBlowout.scoreB }
      : null,
    highlights,
    playerStats: players.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      gamesPlayed: p.gamesPlayed,
      wins: p.wins,
      losses: p.losses,
      pointDiff: p.pointsFor - p.pointsAgainst,
    })),
  }
}

/**
 * Get attendance streak for a player
 */
export async function getAttendanceStreak(playerId: string): Promise<number> {
  const sessions = await prisma.session.findMany({
    where: { status: 'COMPLETED' },
    orderBy: { date: 'desc' },
    include: {
      attendances: {
        where: { playerId },
      },
    },
  })

  let streak = 0
  for (const session of sessions) {
    const attended = session.attendances.some((a) => a.present)
    if (attended) {
      streak++
    } else {
      break
    }
  }

  return streak
}

/**
 * Check badge eligibility for a player
 * Returns an array of badge codes they qualify for
 */
export async function checkBadgeEligibility(playerId: string): Promise<string[]> {
  const eligibleBadges: string[] = []

  // Get player stats
  const stats = await getPlayerLifetimeStats(playerId)

  // FIRST_WIN: Won at least one game
  if (stats.wins >= 1) {
    eligibleBadges.push('FIRST_WIN')
  }

  // TOURNAMENT_WINNER: Won at least one completed tournament
  const tournamentWins = await prisma.tournament.count({
    where: {
      status: 'COMPLETED',
      winnerTeam: {
        OR: [
          { playerAId: playerId },
          { playerBId: playerId },
        ],
      },
    },
  })
  if (tournamentWins > 0) {
    eligibleBadges.push('TOURNAMENT_WINNER')
  }

  // CENTURY_CLUB: 100 total games
  if (stats.gamesPlayed >= 100) {
    eligibleBadges.push('CENTURY_CLUB')
  }

  // VETERAN: 25 total games
  if (stats.gamesPlayed >= 25) {
    eligibleBadges.push('VETERAN')
  }

  // HALF_CENTURY: 50 total games
  if (stats.gamesPlayed >= 50) {
    eligibleBadges.push('HALF_CENTURY')
  }

  // REGULAR: Attended 10 sessions
  if (stats.sessionsAttended >= 10) {
    eligibleBadges.push('REGULAR')
  }

  // DEDICATED: Attended 25 sessions
  if (stats.sessionsAttended >= 25) {
    eligibleBadges.push('DEDICATED')
  }

  // STREAK_BEAST: 5+ session attendance streak
  const streak = await getAttendanceStreak(playerId)
  if (streak >= 5) {
    eligibleBadges.push('STREAK_BEAST')
  }

  // EARLY_BIRD: 3 consecutive sessions
  if (streak >= 3) {
    eligibleBadges.push('EARLY_BIRD')
  }

  // ON_FIRE: 10+ session attendance streak
  if (streak >= 10) {
    eligibleBadges.push('ON_FIRE')
  }

  // Get all games for per-game badges (SHUTOUT, NAIL_BITER, DOMINANT)
  const allGames = await prisma.game.findMany({
    where: {
      OR: [
        { teamAPlayers: { some: { id: playerId } } },
        { teamBPlayers: { some: { id: playerId } } },
      ],
    },
    include: {
      teamAPlayers: true,
      teamBPlayers: true,
    },
  })

  // Track unique teammates and partner/opponent stats for social badges
  const allTeammates = new Set<string>()
  const partnerWins = new Map<string, number>() // partnerId -> win count
  const opponentGames = new Map<string, number>() // opponentPairKey -> game count

  for (const game of allGames) {
    const isTeamA = game.teamAPlayers.some((p) => p.id === playerId)
    const isTeamB = game.teamBPlayers.some((p) => p.id === playerId)
    if (!isTeamA && !isTeamB) continue

    const myScore = isTeamA ? game.scoreA : game.scoreB
    const theirScore = isTeamA ? game.scoreB : game.scoreA
    const didWin = myScore > theirScore
    const margin = Math.abs(myScore - theirScore)
    const myTeam = isTeamA ? game.teamAPlayers : game.teamBPlayers
    const opponents = isTeamA ? game.teamBPlayers : game.teamAPlayers

    // Per-game performance badges
    if (didWin && theirScore === 0) {
      eligibleBadges.push('SHUTOUT')
    }
    if (didWin && margin === 1) {
      eligibleBadges.push('NAIL_BITER')
    }
    if (didWin && margin >= 10) {
      eligibleBadges.push('DOMINANT')
    }

    // Track teammates for MIXER
    myTeam.forEach((t) => {
      if (t.id !== playerId) allTeammates.add(t.id)
    })

    // Track partner wins for DYNAMIC_DUO
    if (didWin) {
      myTeam.forEach((t) => {
        if (t.id !== playerId) {
          partnerWins.set(t.id, (partnerWins.get(t.id) || 0) + 1)
        }
      })
    }

    // Track opponent pair games for RIVAL
    const opponentKey = opponents.map((p) => p.id).sort().join('-')
    opponentGames.set(opponentKey, (opponentGames.get(opponentKey) || 0) + 1)
  }

  // MIXER: 20 unique teammates
  if (allTeammates.size >= 20) {
    eligibleBadges.push('MIXER')
  }

  // DYNAMIC_DUO: 10+ wins with same partner
  for (const [, winCount] of partnerWins) {
    if (winCount >= 10) {
      eligibleBadges.push('DYNAMIC_DUO')
      break
    }
  }

  // RIVAL: 10+ games against same opponent pair
  for (const [, gameCount] of opponentGames) {
    if (gameCount >= 10) {
      eligibleBadges.push('RIVAL')
      break
    }
  }

  // Check session-specific badges
  const sessions = await prisma.session.findMany({
    where: {
      status: 'COMPLETED',
      attendances: { some: { playerId, present: true } },
    },
    include: {
      games: {
        include: {
          teamAPlayers: true,
          teamBPlayers: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  for (const session of sessions) {
    let gamesInSession = 0
    let winsInSession = 0
    const teammates = new Set<string>()
    // Track game-by-game results for COMEBACK_KING
    const gameResults: boolean[] = []

    for (const game of session.games) {
      const isTeamA = game.teamAPlayers.some((p) => p.id === playerId)
      const isTeamB = game.teamBPlayers.some((p) => p.id === playerId)
      
      if (!isTeamA && !isTeamB) continue

      gamesInSession++
      const myTeam = isTeamA ? game.teamAPlayers : game.teamBPlayers
      const didWin = isTeamA ? game.scoreA > game.scoreB : game.scoreB > game.scoreA

      if (didWin) winsInSession++
      gameResults.push(didWin)
      myTeam.forEach((t) => {
        if (t.id !== playerId) teammates.add(t.id)
      })
    }

    // MARATHONER: 10+ games in one session
    if (gamesInSession >= 10) {
      eligibleBadges.push('MARATHONER')
    }

    // SOCIAL_BUTTERFLY: 5+ unique teammates in one session
    if (teammates.size >= 5) {
      eligibleBadges.push('SOCIAL_BUTTERFLY')
    }

    // UNDEFEATED: Won all games in a session (min 3 games)
    if (gamesInSession >= 3 && winsInSession === gamesInSession) {
      eligibleBadges.push('UNDEFEATED')
    }

    // COMEBACK_KING: Lost first 2+ games but finished session with winning record
    if (gameResults.length >= 3) {
      const lostFirstTwo = gameResults.length >= 2 && !gameResults[0] && !gameResults[1]
      if (lostFirstTwo && winsInSession > (gamesInSession - winsInSession)) {
        eligibleBadges.push('COMEBACK_KING')
      }
    }
  }

  // Remove duplicates
  return [...new Set(eligibleBadges)]
}

/**
 * Get badge progress for a player
 * Returns progress toward each unearned badge
 */
export async function getBadgeProgress(playerId: string): Promise<{ code: string; current: number; target: number }[]> {
  const stats = await getPlayerLifetimeStats(playerId)
  const streak = await getAttendanceStreak(playerId)

  // Get all games for social badge progress
  const allGames = await prisma.game.findMany({
    where: {
      OR: [
        { teamAPlayers: { some: { id: playerId } } },
        { teamBPlayers: { some: { id: playerId } } },
      ],
    },
    include: {
      teamAPlayers: true,
      teamBPlayers: true,
    },
  })

  // Count unique teammates, max partner wins, max opponent games
  const allTeammates = new Set<string>()
  const partnerWins = new Map<string, number>()
  const opponentGames = new Map<string, number>()

  for (const game of allGames) {
    const isTeamA = game.teamAPlayers.some((p) => p.id === playerId)
    const isTeamB = game.teamBPlayers.some((p) => p.id === playerId)
    if (!isTeamA && !isTeamB) continue

    const didWin = isTeamA ? game.scoreA > game.scoreB : game.scoreB > game.scoreA
    const myTeam = isTeamA ? game.teamAPlayers : game.teamBPlayers
    const opponents = isTeamA ? game.teamBPlayers : game.teamAPlayers

    myTeam.forEach((t) => {
      if (t.id !== playerId) allTeammates.add(t.id)
    })

    if (didWin) {
      myTeam.forEach((t) => {
        if (t.id !== playerId) {
          partnerWins.set(t.id, (partnerWins.get(t.id) || 0) + 1)
        }
      })
    }

    const opponentKey = opponents.map((p) => p.id).sort().join('-')
    opponentGames.set(opponentKey, (opponentGames.get(opponentKey) || 0) + 1)
  }

  const maxPartnerWins = partnerWins.size > 0 ? Math.max(...partnerWins.values()) : 0
  const maxOpponentGames = opponentGames.size > 0 ? Math.max(...opponentGames.values()) : 0

  return [
    { code: 'TOURNAMENT_WINNER', current: 0, target: 1 },
    { code: 'FIRST_WIN', current: Math.min(stats.wins, 1), target: 1 },
    { code: 'VETERAN', current: Math.min(stats.gamesPlayed, 25), target: 25 },
    { code: 'HALF_CENTURY', current: Math.min(stats.gamesPlayed, 50), target: 50 },
    { code: 'CENTURY_CLUB', current: Math.min(stats.gamesPlayed, 100), target: 100 },
    { code: 'REGULAR', current: Math.min(stats.sessionsAttended, 10), target: 10 },
    { code: 'DEDICATED', current: Math.min(stats.sessionsAttended, 25), target: 25 },
    { code: 'EARLY_BIRD', current: Math.min(streak, 3), target: 3 },
    { code: 'STREAK_BEAST', current: Math.min(streak, 5), target: 5 },
    { code: 'ON_FIRE', current: Math.min(streak, 10), target: 10 },
    { code: 'MIXER', current: Math.min(allTeammates.size, 20), target: 20 },
    { code: 'DYNAMIC_DUO', current: Math.min(maxPartnerWins, 10), target: 10 },
    { code: 'RIVAL', current: Math.min(maxOpponentGames, 10), target: 10 },
    // These badges don't have numeric progress (they're event-based)
    // We use 0/1 to indicate not-yet-earned vs earned
    { code: 'SHUTOUT', current: 0, target: 1 },
    { code: 'NAIL_BITER', current: 0, target: 1 },
    { code: 'DOMINANT', current: 0, target: 1 },
    { code: 'UNDEFEATED', current: 0, target: 1 },
    { code: 'COMEBACK_KING', current: 0, target: 1 },
    { code: 'MARATHONER', current: 0, target: 1 },
    { code: 'SOCIAL_BUTTERFLY', current: 0, target: 1 },
  ]
}

/**
 * Award new badges to a player
 * Checks eligibility and awards any badges they don't already have
 */
export async function awardNewBadges(playerId: string): Promise<string[]> {
  const eligibleBadges = await checkBadgeEligibility(playerId)
  
  // Get already earned badges
  const existingBadges = await prisma.playerBadge.findMany({
    where: { playerId },
    include: { badge: true },
  })
  const existingCodes = new Set(existingBadges.map((pb) => pb.badge.code))

  // Find new badges to award
  const newBadgeCodes = eligibleBadges.filter((code) => !existingCodes.has(code))

  // Award new badges
  for (const code of newBadgeCodes) {
    const badge = await prisma.badge.findUnique({ where: { code } })
    if (badge) {
      await prisma.playerBadge.create({
        data: {
          playerId,
          badgeId: badge.id,
        },
      })
    }
  }

  return newBadgeCodes
}

