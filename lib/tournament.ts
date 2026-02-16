import { Prisma, TournamentMatchStage, TournamentSpecialMode, TournamentStage, TournamentTeamMode } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createSessionGameWithElo } from '@/lib/gameCreation'
import { awardNewBadges } from '@/lib/stats'

type Attendee = {
  id: string
  name: string
  emoji: string
  rating: number
}

type TeamDraft = {
  name: string
  seed: number
  playerAId: string
  playerBId?: string
}

function pairKey(playerIds: string[]): string {
  return [...playerIds].sort().join('|')
}

function createRandomTeams(players: Attendee[]): TeamDraft[] {
  const shuffled = [...players].sort(() => Math.random() - 0.5)
  const teams: TeamDraft[] = []
  for (let i = 0; i < shuffled.length - 1; i += 2) {
    const p1 = shuffled[i]
    const p2 = shuffled[i + 1]
    teams.push({
      name: `${p1.emoji}${p1.name} + ${p2.emoji}${p2.name}`,
      seed: teams.length + 1,
      playerAId: p1.id,
      playerBId: p2.id,
    })
  }
  return teams
}

export function createFairTeams(players: Attendee[]): TeamDraft[] {
  const sorted = [...players].sort((a, b) => b.rating - a.rating)
  const teams: TeamDraft[] = []
  let left = 0
  let right = sorted.length - 1
  while (left < right) {
    const high = sorted[left]
    const low = sorted[right]
    teams.push({
      name: `${high.emoji}${high.name} + ${low.emoji}${low.name}`,
      seed: teams.length + 1,
      playerAId: high.id,
      playerBId: low.id,
    })
    left += 1
    right -= 1
  }
  return teams
}

function nextPowerOfTwoBelow(value: number): number {
  let result = 1
  while (result * 2 <= value) result *= 2
  return result
}

function createFivePlayerMixedRounds(players: Attendee[]): Array<{ teamAPlayerIds: string[]; teamBPlayerIds: string[]; metadata: Prisma.JsonObject }> {
  const rounds: Array<{ teamAPlayerIds: string[]; teamBPlayerIds: string[]; metadata: Prisma.JsonObject }> = []
  for (let round = 0; round < 5; round++) {
    const sitOut = players[round]
    const active: Attendee[] = []
    for (let offset = 1; offset <= 4; offset++) {
      active.push(players[(round + offset) % players.length])
    }
    const teamA = [active[0], active[1]]
    const teamB = [active[2], active[3]]
    rounds.push({
      teamAPlayerIds: teamA.map((p) => p.id),
      teamBPlayerIds: teamB.map((p) => p.id),
      metadata: {
        sitOutPlayerId: sitOut.id,
        sitOutPlayerName: sitOut.name,
      },
    })
  }
  return rounds
}

async function createBracketRound(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  round: number,
  teamIds: string[]
) {
  for (let i = 0; i < teamIds.length; i += 2) {
    const teamAId = teamIds[i]
    const teamBId = teamIds[i + 1] ?? null
    const teamA = await tx.tournamentTeam.findUnique({ where: { id: teamAId } })
    const teamB = teamBId ? await tx.tournamentTeam.findUnique({ where: { id: teamBId } }) : null

    const isBye = !teamB
    await tx.tournamentMatch.create({
      data: {
        tournamentId,
        stage: TournamentMatchStage.BRACKET,
        round,
        slot: (i / 2) + 1,
        bestOf: 3,
        teamAId,
        teamBId,
        teamAPlayerIds: [teamA!.playerAId, teamA!.playerBId].filter(Boolean) as string[],
        teamBPlayerIds: teamB ? [teamB.playerAId, teamB.playerBId].filter(Boolean) as string[] : [],
        isComplete: isBye,
        winnerTeamId: isBye ? teamAId : null,
      },
    })
  }
}

async function setupInitialMatches(tx: Prisma.TransactionClient, tournamentId: string, teamIds: string[], attendeePlayers: Attendee[], specialMode: TournamentSpecialMode) {
  if (specialMode === TournamentSpecialMode.MIXED_ROUND_ROBIN) {
    if (attendeePlayers.length === 5) {
      const rounds = createFivePlayerMixedRounds(attendeePlayers)
      for (let i = 0; i < rounds.length; i += 1) {
        const round = rounds[i]
        await tx.tournamentMatch.create({
          data: {
            tournamentId,
            stage: TournamentMatchStage.ROUND_ROBIN,
            round: 1,
            slot: i + 1,
            bestOf: 3,
            teamAPlayerIds: round.teamAPlayerIds,
            teamBPlayerIds: round.teamBPlayerIds,
            metadata: round.metadata,
          },
        })
      }
      return TournamentStage.ROUND_ROBIN
    }

    const teams = await tx.tournamentTeam.findMany({
      where: { id: { in: teamIds } },
      orderBy: { seed: 'asc' },
    })
    const [team1, team2] = teams
    const pairings: Array<{ a: string[]; b: string[] }> = [
      { a: [team1.playerAId, team1.playerBId!], b: [team2.playerAId, team2.playerBId!] },
      { a: [team1.playerAId, team2.playerAId], b: [team1.playerBId!, team2.playerBId!] },
      { a: [team1.playerAId, team2.playerBId!], b: [team1.playerBId!, team2.playerAId] },
    ]
    for (let i = 0; i < pairings.length; i += 1) {
      await tx.tournamentMatch.create({
        data: {
          tournamentId,
          stage: TournamentMatchStage.ROUND_ROBIN,
          round: 1,
          slot: i + 1,
          bestOf: 3,
          teamAPlayerIds: pairings[i].a,
          teamBPlayerIds: pairings[i].b,
          metadata: { mixedRound: true },
        },
      })
    }
    return TournamentStage.ROUND_ROBIN
  }

  if (teamIds.length % 2 == 1) {
    for (let i = 0; i < teamIds.length; i += 1) {
      for (let j = i + 1; j < teamIds.length; j += 1) {
        const teamA = await tx.tournamentTeam.findUnique({ where: { id: teamIds[i] } })
        const teamB = await tx.tournamentTeam.findUnique({ where: { id: teamIds[j] } })
        await tx.tournamentMatch.create({
          data: {
            tournamentId,
            stage: TournamentMatchStage.ROUND_ROBIN,
            round: 1,
            slot: (i * 100) + j,
            bestOf: 3,
            teamAId: teamIds[i],
            teamBId: teamIds[j],
            teamAPlayerIds: [teamA!.playerAId, teamA!.playerBId].filter(Boolean) as string[],
            teamBPlayerIds: [teamB!.playerAId, teamB!.playerBId].filter(Boolean) as string[],
          },
        })
      }
    }
    return TournamentStage.ROUND_ROBIN
  }

  await createBracketRound(tx, tournamentId, 1, teamIds)
  return TournamentStage.BRACKET
}

export async function setupTournament(sessionId: string, mode: TournamentTeamMode) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      attendances: {
        where: { present: true },
        include: { player: true },
      },
    },
  })
  if (!session) throw new Error('Session not found')

  const existingActive = await prisma.tournament.findFirst({
    where: { status: 'ACTIVE' },
  })
  if (existingActive) {
    throw new Error('A tournament is already active')
  }

  const attendees: Attendee[] = session.attendances.map((a) => ({
    id: a.player.id,
    name: a.player.name,
    emoji: a.player.emoji,
    rating: a.player.rating,
  }))
  if (attendees.length < 4) {
    throw new Error('Need at least 4 attendees to start a tournament')
  }

  const teams = mode === TournamentTeamMode.FAIR ? createFairTeams(attendees) : createRandomTeams(attendees)
  if (teams.length < 2) {
    throw new Error('Need at least 2 teams to start a tournament')
  }

  const specialMode = attendees.length === 5 || teams.length === 2
    ? TournamentSpecialMode.MIXED_ROUND_ROBIN
    : TournamentSpecialMode.NONE

  return prisma.$transaction(async (tx) => {
    const tournament = await tx.tournament.create({
      data: {
        sessionId,
        status: 'ACTIVE',
        teamMode: mode,
        stage: TournamentStage.ROUND_ROBIN,
        specialMode,
      },
    })

    const createdTeams = []
    for (const team of teams) {
      const created = await tx.tournamentTeam.create({
        data: {
          tournamentId: tournament.id,
          name: team.name,
          seed: team.seed,
          playerAId: team.playerAId,
          playerBId: team.playerBId,
        },
      })
      createdTeams.push(created)
    }

    const stage = await setupInitialMatches(
      tx,
      tournament.id,
      createdTeams.map((t) => t.id),
      attendees,
      specialMode
    )
    await tx.tournament.update({
      where: { id: tournament.id },
      data: { stage },
    })

    return tx.tournament.findUnique({
      where: { id: tournament.id },
      include: {
        teams: { include: { playerA: true, playerB: true }, orderBy: { seed: 'asc' } },
        matches: {
          include: {
            teamA: { include: { playerA: true, playerB: true } },
            teamB: { include: { playerA: true, playerB: true } },
            winnerTeam: { include: { playerA: true, playerB: true } },
            loserTeam: { include: { playerA: true, playerB: true } },
            games: {
              include: {
                game: {
                  include: {
                    teamAPlayers: true,
                    teamBPlayers: true,
                  },
                },
              },
              orderBy: { gameNumber: 'asc' },
            },
          },
          orderBy: [{ stage: 'asc' }, { round: 'asc' }, { slot: 'asc' }],
        },
      },
    })
  })
}

async function finalizeFromRoundRobin(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      teams: true,
      matches: {
        where: { stage: TournamentMatchStage.ROUND_ROBIN },
      },
    },
  })
  if (!tournament) throw new Error('Tournament not found')

  const allComplete = tournament.matches.every((m) => m.isComplete)
  if (!allComplete) return

  if (tournament.specialMode === TournamentSpecialMode.MIXED_ROUND_ROBIN) {
    const pairWins = new Map<string, number>()
    for (const match of tournament.matches) {
      const winnerPlayers = match.winsA > match.winsB ? match.teamAPlayerIds : match.teamBPlayerIds
      const key = pairKey(winnerPlayers)
      pairWins.set(key, (pairWins.get(key) || 0) + 1)
    }
    const topPairs = [...pairWins.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map((entry) => entry[0].split('|'))
    if (topPairs.length < 2) return

    const teamA = await prisma.tournamentTeam.create({
      data: {
        tournamentId,
        name: `Final Pair A`,
        seed: 98,
        playerAId: topPairs[0][0],
        playerBId: topPairs[0][1],
      },
    })
    const teamB = await prisma.tournamentTeam.create({
      data: {
        tournamentId,
        name: `Final Pair B`,
        seed: 99,
        playerAId: topPairs[1][0],
        playerBId: topPairs[1][1],
      },
    })

    await prisma.tournamentMatch.create({
      data: {
        tournamentId,
        stage: TournamentMatchStage.WINNERS_FINAL,
        round: 1,
        slot: 1,
        bestOf: 3,
        teamAId: teamA.id,
        teamBId: teamB.id,
        teamAPlayerIds: topPairs[0],
        teamBPlayerIds: topPairs[1],
      },
    })
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { stage: TournamentStage.FINALS },
    })
    return
  }

  const standings = [...tournament.teams]
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins
      if (a.losses !== b.losses) return a.losses - b.losses
      return a.seed - b.seed
    })
  const bracketSize = nextPowerOfTwoBelow(standings.length)
  const qualifiers = standings.slice(0, bracketSize)
  if (qualifiers.length < 2) return

  await prisma.tournamentMatch.deleteMany({
    where: {
      tournamentId,
      stage: TournamentMatchStage.BRACKET,
    },
  })
  await createBracketRound(
    prisma,
    tournamentId,
    1,
    qualifiers.map((t) => t.id)
  )
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { stage: TournamentStage.BRACKET },
  })
}

async function advanceBracketIfReady(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      matches: {
        where: { stage: TournamentMatchStage.BRACKET },
        orderBy: [{ round: 'asc' }, { slot: 'asc' }],
      },
    },
  })
  if (!tournament) throw new Error('Tournament not found')
  const rounds = new Map<number, typeof tournament.matches>()
  for (const match of tournament.matches) {
    const current = rounds.get(match.round) ?? []
    current.push(match)
    rounds.set(match.round, current)
  }
  const highestRound = Math.max(...rounds.keys(), 1)
  const currentRoundMatches = rounds.get(highestRound) ?? []
  if (currentRoundMatches.length === 0 || !currentRoundMatches.every((m) => m.isComplete)) return

  const winners = currentRoundMatches.map((m) => m.winnerTeamId).filter(Boolean) as string[]
  if (winners.length === 1) {
    const championTeamId = winners[0]
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: 'COMPLETED',
        stage: TournamentStage.COMPLETED,
        winnerTeamId: championTeamId,
        endedAt: new Date(),
      },
    })
    return
  }

  await createBracketRound(prisma, tournamentId, highestRound + 1, winners)

  // Semifinal losers go to a 3rd-place match
  if (currentRoundMatches.length === 2) {
    const loserTeamIds = currentRoundMatches.map((m) => m.loserTeamId).filter(Boolean) as string[]
    if (loserTeamIds.length === 2) {
      const teams = await prisma.tournamentTeam.findMany({ where: { id: { in: loserTeamIds } } })
      const [a, b] = teams
      await prisma.tournamentMatch.create({
        data: {
          tournamentId,
          stage: TournamentMatchStage.LOSERS_FINAL,
          round: 1,
          slot: 1,
          bestOf: 3,
          teamAId: a.id,
          teamBId: b.id,
          teamAPlayerIds: [a.playerAId, a.playerBId].filter(Boolean) as string[],
          teamBPlayerIds: [b.playerAId, b.playerBId].filter(Boolean) as string[],
        },
      })
    }
  }
}

export async function recordTournamentGame(input: {
  sessionId: string
  tournamentId: string
  matchId: string
  scoreA: number
  scoreB: number
}) {
  const { sessionId, tournamentId, matchId, scoreA, scoreB } = input
  if (scoreA === scoreB) throw new Error('Games cannot end in a tie')

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } })
  if (!tournament) throw new Error('Tournament not found')
  if (tournament.status !== 'ACTIVE') throw new Error('Tournament is not active')

  const match = await prisma.tournamentMatch.findUnique({
    where: { id: matchId },
    include: { games: true },
  })
  if (!match || match.tournamentId !== tournamentId) throw new Error('Match not found')
  if (match.isComplete) throw new Error('Match is already complete')

  const game = await createSessionGameWithElo({
    sessionId,
    teamAPlayerIds: match.teamAPlayerIds,
    teamBPlayerIds: match.teamBPlayerIds,
    scoreA,
    scoreB,
  })

  const nextGameNumber = match.games.length + 1
  const winnerSide = scoreA > scoreB ? 'A' : 'B'
  const winsA = match.winsA + (winnerSide === 'A' ? 1 : 0)
  const winsB = match.winsB + (winnerSide === 'B' ? 1 : 0)
  const isSeriesOver = winsA >= 2 || winsB >= 2 || nextGameNumber >= match.bestOf

  let winnerTeamId = match.winnerTeamId
  let loserTeamId = match.loserTeamId
  if (isSeriesOver && match.teamAId && match.teamBId) {
    winnerTeamId = winsA > winsB ? match.teamAId : match.teamBId
    loserTeamId = winsA > winsB ? match.teamBId : match.teamAId
  }

  await prisma.$transaction(async (tx) => {
    await tx.tournamentMatchGame.create({
      data: {
        tournamentMatchId: matchId,
        gameId: game.id,
        gameNumber: nextGameNumber,
      },
    })

    await tx.tournamentMatch.update({
      where: { id: matchId },
      data: {
        winsA,
        winsB,
        isComplete: isSeriesOver,
        winnerTeamId,
        loserTeamId,
      },
    })

    if (isSeriesOver && winnerTeamId && loserTeamId && match.stage === TournamentMatchStage.ROUND_ROBIN) {
      await tx.tournamentTeam.update({
        where: { id: winnerTeamId },
        data: { wins: { increment: 1 } },
      })
      await tx.tournamentTeam.update({
        where: { id: loserTeamId },
        data: { losses: { increment: 1 } },
      })
    }
  })

  await finalizeFromRoundRobin(tournamentId)
  await advanceBracketIfReady(tournamentId)

  if (match.stage === TournamentMatchStage.WINNERS_FINAL) {
    const refreshed = await prisma.tournamentMatch.findUnique({ where: { id: matchId } })
    if (refreshed?.isComplete) {
      const winnerId = refreshed.winsA > refreshed.winsB ? refreshed.teamAId : refreshed.teamBId
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: {
          status: 'COMPLETED',
          stage: TournamentStage.COMPLETED,
          winnerTeamId: winnerId,
          endedAt: new Date(),
        },
      })
    }
  }
  const result = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      teams: { include: { playerA: true, playerB: true }, orderBy: { seed: 'asc' } },
      matches: {
        include: {
          teamA: { include: { playerA: true, playerB: true } },
          teamB: { include: { playerA: true, playerB: true } },
          winnerTeam: { include: { playerA: true, playerB: true } },
          loserTeam: { include: { playerA: true, playerB: true } },
          games: {
            include: {
              game: {
                include: {
                  teamAPlayers: true,
                  teamBPlayers: true,
                },
              },
            },
            orderBy: { gameNumber: 'asc' },
          },
        },
        orderBy: [{ stage: 'asc' }, { round: 'asc' }, { slot: 'asc' }],
      },
    },
  })
  if (result?.status === 'COMPLETED' && result.winnerTeamId) {
    const winnerTeam = await prisma.tournamentTeam.findUnique({ where: { id: result.winnerTeamId } })
    if (winnerTeam) {
      await awardNewBadges(winnerTeam.playerAId)
      if (winnerTeam.playerBId) {
        await awardNewBadges(winnerTeam.playerBId)
      }
    }
  }
  return result
}

export async function getSessionTournament(sessionId: string) {
  return prisma.tournament.findUnique({
    where: { sessionId },
    include: {
      teams: { include: { playerA: true, playerB: true }, orderBy: { seed: 'asc' } },
      matches: {
        include: {
          teamA: { include: { playerA: true, playerB: true } },
          teamB: { include: { playerA: true, playerB: true } },
          winnerTeam: { include: { playerA: true, playerB: true } },
          loserTeam: { include: { playerA: true, playerB: true } },
          games: {
            include: {
              game: {
                include: {
                  teamAPlayers: true,
                  teamBPlayers: true,
                },
              },
            },
            orderBy: { gameNumber: 'asc' },
          },
        },
        orderBy: [{ stage: 'asc' }, { round: 'asc' }, { slot: 'asc' }],
      },
    },
  })
}

export async function endTournamentEarly(sessionId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { sessionId } })
  if (!tournament) throw new Error('Tournament not found')
  if (tournament.status !== 'ACTIVE') {
    return getSessionTournament(sessionId)
  }
  return prisma.tournament.update({
    where: { id: tournament.id },
    data: {
      status: 'ENDED',
      stage: TournamentStage.ENDED,
      endedAt: new Date(),
    },
    include: {
      teams: { include: { playerA: true, playerB: true }, orderBy: { seed: 'asc' } },
      matches: {
        include: {
          teamA: { include: { playerA: true, playerB: true } },
          teamB: { include: { playerA: true, playerB: true } },
          winnerTeam: { include: { playerA: true, playerB: true } },
          loserTeam: { include: { playerA: true, playerB: true } },
          games: {
            include: {
              game: {
                include: {
                  teamAPlayers: true,
                  teamBPlayers: true,
                },
              },
            },
            orderBy: { gameNumber: 'asc' },
          },
        },
        orderBy: [{ stage: 'asc' }, { round: 'asc' }, { slot: 'asc' }],
      },
    },
  })
}
