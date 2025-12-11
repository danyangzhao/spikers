'use client'

import { useState, useEffect, use, useCallback } from 'react'
import Link from 'next/link'
import PlayerChip from '@/components/PlayerChip'
import GameCard from '@/components/GameCard'
import RSVPButton from '@/components/RSVPButton'
import SessionAwards from '@/components/SessionAwards'

interface Player {
  id: string
  name: string
  emoji: string
  rating: number
}

interface Game {
  id: string
  scoreA: number
  scoreB: number
  teamAPlayers: Player[]
  teamBPlayers: Player[]
  createdAt: string
}

interface Session {
  id: string
  date: string
  location: string | null
  status: 'UPCOMING' | 'IN_PROGRESS' | 'COMPLETED'
  attendances: Array<{ player: Player; present: boolean }>
  rsvps: Array<{ player: Player; status: 'GOING' | 'MAYBE' | 'OUT' }>
  games: Game[]
}

interface RSVPData {
  playerRsvps: Array<{
    player: Player
    status: 'GOING' | 'MAYBE' | 'OUT' | null
  }>
  summary: {
    going: number
    maybe: number
    out: number
    noResponse: number
  }
}

interface SummaryData {
  totalGames: number
  playerOfTheDay: { id: string; name: string; emoji: string; wins: number } | null
  ironman: { id: string; name: string; emoji: string; gamesPlayed: number } | null
  socialButterfly: { id: string; name: string; emoji: string; uniqueTeammates: number } | null
}

export default function SessionDetailPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = use(params)
  const [session, setSession] = useState<Session | null>(null)
  const [rsvpData, setRsvpData] = useState<RSVPData | null>(null)
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'games' | 'summary'>('overview')
  
  // Game creation state
  const [showAddGame, setShowAddGame] = useState(false)
  const [teamA, setTeamA] = useState<string[]>([])
  const [teamB, setTeamB] = useState<string[]>([])
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${id}`)
      if (res.ok) {
        setSession(await res.json())
      }
    } catch (error) {
      console.error('Failed to fetch session:', error)
    }
  }, [id])

  const fetchRSVP = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${id}/rsvp`)
      if (res.ok) {
        setRsvpData(await res.json())
      }
    } catch (error) {
      console.error('Failed to fetch RSVP:', error)
    }
  }, [id])

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${id}/summary`)
      if (res.ok) {
        setSummaryData(await res.json())
      }
    } catch (error) {
      console.error('Failed to fetch summary:', error)
    }
  }, [id])

  const fetchPlayers = useCallback(async () => {
    try {
      const res = await fetch('/api/players')
      if (res.ok) {
        setAllPlayers(await res.json())
      }
    } catch (error) {
      console.error('Failed to fetch players:', error)
    }
  }, [])

  useEffect(() => {
    async function fetchAll() {
      await Promise.all([
        fetchSession(),
        fetchRSVP(),
        fetchSummary(),
        fetchPlayers(),
      ])
      setLoading(false)
    }
    fetchAll()
  }, [fetchSession, fetchRSVP, fetchSummary, fetchPlayers])

  async function handleRSVPChange(playerId: string, status: 'GOING' | 'MAYBE' | 'OUT') {
    try {
      await fetch(`/api/sessions/${id}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, status }),
      })
      fetchRSVP()
    } catch (error) {
      console.error('Failed to update RSVP:', error)
    }
  }

  async function handleStatusChange(newStatus: Session['status']) {
    try {
      await fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      fetchSession()
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  async function handleAttendanceChange(playerIds: string[]) {
    try {
      await fetch(`/api/sessions/${id}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerIds }),
      })
      fetchSession()
    } catch (error) {
      console.error('Failed to update attendance:', error)
    }
  }

  function handleRandomTeams() {
    const presentPlayerIds = session?.attendances
      .filter((a) => a.present)
      .map((a) => a.player.id) || []

    if (presentPlayerIds.length < 4) {
      alert('Need at least 4 players present to generate teams')
      return
    }

    // Fisher-Yates shuffle
    const shuffled = [...presentPlayerIds]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    setTeamA(shuffled.slice(0, 2))
    setTeamB(shuffled.slice(2, 4))
    setShowAddGame(true)
  }

  async function handleAddGame(e: React.FormEvent) {
    e.preventDefault()
    if (teamA.length !== 2 || teamB.length !== 2) {
      alert('Each team needs exactly 2 players')
      return
    }

    try {
      await fetch(`/api/sessions/${id}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamAPlayerIds: teamA,
          teamBPlayerIds: teamB,
          scoreA: parseInt(scoreA),
          scoreB: parseInt(scoreB),
        }),
      })
      setShowAddGame(false)
      setTeamA([])
      setTeamB([])
      setScoreA('')
      setScoreB('')
      fetchSession()
      fetchSummary()
    } catch (error) {
      console.error('Failed to add game:', error)
    }
  }

  async function handleDeleteGame(gameId: string) {
    if (!confirm('Delete this game?')) return

    try {
      await fetch(`/api/games/${gameId}`, { method: 'DELETE' })
      fetchSession()
      fetchSummary()
    } catch (error) {
      console.error('Failed to delete game:', error)
    }
  }

  async function handleDeleteSession() {
    const confirmMessage = session?.games.length 
      ? `Delete this session and all ${session.games.length} game(s)? Player ratings will be reverted.`
      : 'Delete this session?'
    
    if (!confirm(confirmMessage)) return

    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        // Navigate back to sessions list
        window.location.href = '/sessions'
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete session')
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
      alert('Failed to delete session')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC', // Use UTC to match stored value
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-4xl animate-pulse">🏐</div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-4">😕</p>
        <p>Session not found</p>
        <Link href="/sessions" className="btn btn-secondary mt-4">
          Back to Sessions
        </Link>
      </div>
    )
  }

  const presentPlayers = session.attendances.filter((a) => a.present)
  const getPlayerById = (playerId: string) =>
    allPlayers.find((p) => p.id === playerId) || presentPlayers.find((a) => a.player.id === playerId)?.player

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/sessions" className="btn btn-ghost p-2">
          ←
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{formatDate(session.date)}</h1>
          {session.location && (
            <p className="text-sm text-[var(--foreground-muted)]">📍 {session.location}</p>
          )}
        </div>
        <button
          onClick={handleDeleteSession}
          className="btn btn-ghost p-2 text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/10"
          title="Delete session"
        >
          🗑️
        </button>
      </div>

      {/* Status Controls */}
      <div className="card p-3 mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-sm text-[var(--foreground-muted)]">Status:</span>
        {(['UPCOMING', 'IN_PROGRESS', 'COMPLETED'] as const).map((status) => (
          <button
            key={status}
            onClick={() => handleStatusChange(status)}
            className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
              session.status === status
                ? status === 'COMPLETED'
                  ? 'bg-[var(--accent-success)] text-black'
                  : status === 'IN_PROGRESS'
                  ? 'bg-[var(--accent-primary)] text-black'
                  : 'bg-[var(--accent-info)] text-black'
                : 'bg-[var(--background-elevated)] hover:bg-white/10'
            }`}
          >
            {status === 'UPCOMING' && '📅 Upcoming'}
            {status === 'IN_PROGRESS' && '🏐 Live'}
            {status === 'COMPLETED' && '✅ Done'}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {(['overview', 'games', 'summary'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`btn ${
              activeTab === tab ? 'btn-primary' : 'btn-secondary'
            } whitespace-nowrap`}
          >
            {tab === 'overview' && '👥 Overview'}
            {tab === 'games' && `🎮 Games (${session.games.length})`}
            {tab === 'summary' && '🏆 Summary'}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
          {/* RSVP Section - Show for UPCOMING */}
          {session.status === 'UPCOMING' && rsvpData && (
            <div>
              <h3 className="text-sm text-[var(--foreground-muted)] uppercase tracking-wide mb-3">
                RSVP ({rsvpData.summary.going} going, {rsvpData.summary.maybe} maybe)
              </h3>
              <div className="space-y-3">
                {rsvpData.playerRsvps.map(({ player, status }) => (
                  <div key={player.id} className="card-elevated p-3">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xl">{player.emoji}</span>
                      <span className="font-medium flex-1">{player.name}</span>
                    </div>
                    <RSVPButton
                      currentStatus={status}
                      onStatusChange={(newStatus) => handleRSVPChange(player.id, newStatus)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attendance Section - Show for IN_PROGRESS or COMPLETED */}
          {(session.status === 'IN_PROGRESS' || session.status === 'COMPLETED') && (
            <div>
              <h3 className="text-sm text-[var(--foreground-muted)] uppercase tracking-wide mb-3">
                Attendance ({presentPlayers.length} present)
              </h3>
              <div className="card p-4">
                <div className="grid grid-cols-2 gap-2">
                  {allPlayers.map((player) => {
                    const isPresent = session.attendances.some(
                      (a) => a.player.id === player.id && a.present
                    )
                    return (
                      <button
                        key={player.id}
                        onClick={() => {
                          const currentIds = session.attendances
                            .filter((a) => a.present)
                            .map((a) => a.player.id)
                          const newIds = isPresent
                            ? currentIds.filter((id) => id !== player.id)
                            : [...currentIds, player.id]
                          handleAttendanceChange(newIds)
                        }}
                        className={`p-3 rounded-lg flex items-center gap-2 transition-all ${
                          isPresent
                            ? 'bg-[var(--accent-success)]/20 border-2 border-[var(--accent-success)]'
                            : 'bg-[var(--background-elevated)] border-2 border-transparent opacity-50'
                        }`}
                      >
                        <span className="text-xl">{player.emoji}</span>
                        <span className="font-medium text-sm truncate">{player.name}</span>
                        {isPresent && <span className="ml-auto">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {session.status === 'IN_PROGRESS' && presentPlayers.length >= 4 && (
            <div>
              <button
                onClick={handleRandomTeams}
                className="btn btn-primary w-full"
              >
                🎲 Random Teams & Add Game
              </button>
            </div>
          )}
        </div>
      )}

      {/* Games Tab */}
      {activeTab === 'games' && (
        <div className="space-y-4 animate-fade-in">
          {session.status === 'IN_PROGRESS' && (
            <div className="flex gap-2">
              <button
                onClick={handleRandomTeams}
                className="btn btn-primary flex-1"
                disabled={presentPlayers.length < 4}
              >
                🎲 Random Teams
              </button>
              <button
                onClick={() => setShowAddGame(true)}
                className="btn btn-secondary flex-1"
              >
                + Manual Game
              </button>
            </div>
          )}

          {showAddGame && (
            <form onSubmit={handleAddGame} className="card p-4 animate-slide-up">
              <h3 className="font-semibold mb-4">Add Game</h3>
              
              {/* Team A */}
              <div className="mb-4">
                <label className="block text-sm text-[var(--foreground-muted)] mb-2">
                  Team A
                </label>
                <div className="flex flex-wrap gap-2">
                  {presentPlayers.map(({ player }) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => {
                        if (teamA.includes(player.id)) {
                          setTeamA(teamA.filter((id) => id !== player.id))
                        } else if (teamA.length < 2 && !teamB.includes(player.id)) {
                          setTeamA([...teamA, player.id])
                        }
                      }}
                      className={`px-3 py-2 rounded-lg text-sm transition-all ${
                        teamA.includes(player.id)
                          ? 'bg-[var(--accent-info)] text-black'
                          : teamB.includes(player.id)
                          ? 'opacity-30 cursor-not-allowed'
                          : 'bg-[var(--background-elevated)]'
                      }`}
                      disabled={teamB.includes(player.id)}
                    >
                      {player.emoji} {player.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Team B */}
              <div className="mb-4">
                <label className="block text-sm text-[var(--foreground-muted)] mb-2">
                  Team B
                </label>
                <div className="flex flex-wrap gap-2">
                  {presentPlayers.map(({ player }) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => {
                        if (teamB.includes(player.id)) {
                          setTeamB(teamB.filter((id) => id !== player.id))
                        } else if (teamB.length < 2 && !teamA.includes(player.id)) {
                          setTeamB([...teamB, player.id])
                        }
                      }}
                      className={`px-3 py-2 rounded-lg text-sm transition-all ${
                        teamB.includes(player.id)
                          ? 'bg-[var(--accent-secondary)] text-black'
                          : teamA.includes(player.id)
                          ? 'opacity-30 cursor-not-allowed'
                          : 'bg-[var(--background-elevated)]'
                      }`}
                      disabled={teamA.includes(player.id)}
                    >
                      {player.emoji} {player.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scores */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-[var(--foreground-muted)] mb-2">
                    Team A Score
                  </label>
                  <input
                    type="number"
                    value={scoreA}
                    onChange={(e) => setScoreA(e.target.value)}
                    className="input text-center text-xl"
                    min="0"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--foreground-muted)] mb-2">
                    Team B Score
                  </label>
                  <input
                    type="number"
                    value={scoreB}
                    onChange={(e) => setScoreB(e.target.value)}
                    className="input text-center text-xl"
                    min="0"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddGame(false)
                    setTeamA([])
                    setTeamB([])
                    setScoreA('')
                    setScoreB('')
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                  disabled={teamA.length !== 2 || teamB.length !== 2 || !scoreA || !scoreB}
                >
                  Save Game
                </button>
              </div>
            </form>
          )}

          {session.games.length === 0 ? (
            <div className="text-center text-[var(--foreground-muted)] py-8">
              <p className="text-4xl mb-2">🎮</p>
              <p>No games yet</p>
              <p className="text-sm">Add your first game!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {session.games.map((game, index) => (
                <GameCard
                  key={game.id}
                  id={game.id}
                  teamA={game.teamAPlayers}
                  teamB={game.teamBPlayers}
                  scoreA={game.scoreA}
                  scoreB={game.scoreB}
                  gameNumber={index + 1}
                  onDelete={
                    session.status === 'IN_PROGRESS'
                      ? () => handleDeleteGame(game.id)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary Tab */}
      {activeTab === 'summary' && summaryData && (
        <div className="animate-fade-in">
          <SessionAwards
            playerOfTheDay={summaryData.playerOfTheDay}
            ironman={summaryData.ironman}
            socialButterfly={summaryData.socialButterfly}
            totalGames={summaryData.totalGames}
          />
        </div>
      )}
    </div>
  )
}

