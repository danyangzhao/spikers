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
  // Get all games
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

  // Get attendance
  const attendances = await prisma.attendance.findMany({
    where: { playerId, present: true },
  })

  let wins = 0
  let losses = 0
  let pointsFor = 0
  let pointsAgainst = 0

  for (const game of games) {
    const isTeamA = game.teamAPlayers.some((p) => p.id === playerId)
    const myScore = isTeamA ? game.scoreA : game.scoreB
    const theirScore = isTeamA ? game.scoreB : game.scoreA

    pointsFor += myScore
    pointsAgainst += theirScore

    if (myScore > theirScore) {
      wins++
    } else {
      losses++
    }
  }

  const gamesPlayed = games.length
  const sessionsAttended = attendances.length
  const winRate = gamesPlayed > 0 ? wins / gamesPlayed : 0
  const avgPointDiff = gamesPlayed > 0 ? (pointsFor - pointsAgainst) / gamesPlayed : 0

  return {
    gamesPlayed,
    wins,
    losses,
    winRate,
    pointsFor,
    pointsAgainst,
    avgPointDiff,
    sessionsAttended,
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
  })

  if (games.length === 0) {
    return null
  }

  // Track stats per player
  const playerStats = new Map<string, PlayerSessionStats & { name: string; emoji: string }>()

  for (const game of games) {
    const teamAWon = game.scoreA > game.scoreB

    // Process team A
    for (const player of game.teamAPlayers) {
      const stats = playerStats.get(player.id) || {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        uniqueTeammates: new Set<string>(),
        name: player.name,
        emoji: player.emoji,
      }
      stats.gamesPlayed++
      if (teamAWon) stats.wins++
      else stats.losses++
      stats.pointsFor += game.scoreA
      stats.pointsAgainst += game.scoreB
      game.teamAPlayers.forEach((t) => {
        if (t.id !== player.id) stats.uniqueTeammates.add(t.id)
      })
      playerStats.set(player.id, stats)
    }

    // Process team B
    for (const player of game.teamBPlayers) {
      const stats = playerStats.get(player.id) || {
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        uniqueTeammates: new Set<string>(),
        name: player.name,
        emoji: player.emoji,
      }
      stats.gamesPlayed++
      if (!teamAWon) stats.wins++
      else stats.losses++
      stats.pointsFor += game.scoreB
      stats.pointsAgainst += game.scoreA
      game.teamBPlayers.forEach((t) => {
        if (t.id !== player.id) stats.uniqueTeammates.add(t.id)
      })
      playerStats.set(player.id, stats)
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

  // CENTURY_CLUB: 100 total games
  if (stats.gamesPlayed >= 100) {
    eligibleBadges.push('CENTURY_CLUB')
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
      },
    },
  })

  for (const session of sessions) {
    let gamesInSession = 0
    let winsInSession = 0
    const teammates = new Set<string>()

    for (const game of session.games) {
      const isTeamA = game.teamAPlayers.some((p) => p.id === playerId)
      const isTeamB = game.teamBPlayers.some((p) => p.id === playerId)
      
      if (!isTeamA && !isTeamB) continue

      gamesInSession++
      const myTeam = isTeamA ? game.teamAPlayers : game.teamBPlayers
      const didWin = isTeamA ? game.scoreA > game.scoreB : game.scoreB > game.scoreA

      if (didWin) winsInSession++
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
  }

  // Remove duplicates
  return [...new Set(eligibleBadges)]
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

