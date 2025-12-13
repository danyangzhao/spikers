'use client'

import { useState, useEffect, use, useCallback } from 'react'
import Link from 'next/link'
import VideoTrimmer from '@/components/VideoTrimmer'

interface Player {
  id: string
  name: string
  emoji: string
}

interface PlayerTag {
  id: string
  playerId: string
  player: Player
  initialX: number
  initialY: number
  color: string
}

interface GameVideo {
  id: string
  status: string
  playbackUrl: string
  duration: number | null
  startTime: number | null
  endTime: number | null
  netX1: number | null
  netY1: number | null
  netX2: number | null
  netY2: number | null
  playerTags: PlayerTag[]
  _count: {
    annotations: number
  }
}

interface Game {
  id: string
  scoreA: number
  scoreB: number
  teamAPlayers: Player[]
  teamBPlayers: Player[]
  session: {
    id: string
    date: string
  }
}

type Step = 'loading' | 'no-video' | 'trim' | 'setup' | 'annotate' | 'complete'

export default function AnnotatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: gameId } = use(params)
  const [game, setGame] = useState<Game | null>(null)
  const [video, setVideo] = useState<GameVideo | null>(null)
  const [step, setStep] = useState<Step>('loading')
  const [error, setError] = useState<string | null>(null)

  const fetchGame = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}`)
      if (res.ok) {
        setGame(await res.json())
      }
    } catch (err) {
      console.error('Failed to fetch game:', err)
    }
  }, [gameId])

  const fetchVideo = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}/video`)
      if (res.ok) {
        const videoData = await res.json()
        setVideo(videoData)
        
        // Determine which step we're on based on video status
        if (videoData.status === 'UPLOADED') {
          // Need to trim first
          setStep(videoData.startTime !== null ? 'setup' : 'trim')
        } else if (videoData.status === 'SETUP_COMPLETE') {
          setStep('annotate')
        } else if (videoData.status === 'ANNOTATED') {
          setStep('complete')
        } else {
          setStep('trim')
        }
      } else if (res.status === 404) {
        setStep('no-video')
      }
    } catch (err) {
      console.error('Failed to fetch video:', err)
      setError('Failed to load video')
    }
  }, [gameId])

  useEffect(() => {
    fetchGame()
    fetchVideo()
  }, [fetchGame, fetchVideo])

  const handleSaveTrim = async (startTime: number, endTime: number) => {
    try {
      const res = await fetch(`/api/games/${gameId}/video/trim`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startTime, endTime }),
      })

      if (res.ok) {
        await fetchVideo()
        setStep('setup')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to save trim points')
      }
    } catch (err) {
      console.error('Failed to save trim:', err)
      setError('Failed to save trim points')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
  }

  if (step === 'loading') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-4xl animate-pulse">📹</div>
      </div>
    )
  }

  if (step === 'no-video') {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-4">📹</p>
        <p className="mb-4">No video uploaded for this game</p>
        <Link href={`/sessions/${game?.session?.id || ''}`} className="btn btn-secondary">
          ← Back to Session
        </Link>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-4">❌</p>
        <p className="text-[var(--accent-danger)] mb-4">{error}</p>
        <button onClick={() => { setError(null); fetchVideo(); }} className="btn btn-secondary">
          Try Again
        </button>
      </div>
    )
  }

  const allPlayers = game ? [...game.teamAPlayers, ...game.teamBPlayers] : []

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href={`/sessions/${game?.session?.id || ''}`} className="btn btn-ghost p-2">
          ←
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">
            {step === 'trim' && '✂️ Trim Video'}
            {step === 'setup' && '🎯 Setup Players & Net'}
            {step === 'annotate' && '📝 Annotate Game'}
            {step === 'complete' && '✅ Annotation Complete'}
          </h1>
          {game && (
            <p className="text-sm text-[var(--foreground-muted)]">
              Game from {formatDate(game.session.date)} • {game.scoreA}-{game.scoreB}
            </p>
          )}
        </div>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-6">
        {['trim', 'setup', 'annotate', 'complete'].map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step === s
                  ? 'bg-[var(--accent-primary)] text-black'
                  : ['trim', 'setup', 'annotate', 'complete'].indexOf(step) > i
                  ? 'bg-[var(--accent-success)] text-black'
                  : 'bg-[var(--background-elevated)] text-[var(--foreground-muted)]'
              }`}
            >
              {i + 1}
            </div>
            {i < 3 && (
              <div
                className={`w-8 h-1 ${
                  ['trim', 'setup', 'annotate', 'complete'].indexOf(step) > i
                    ? 'bg-[var(--accent-success)]'
                    : 'bg-[var(--background-elevated)]'
                }`}
              />
            )}
          </div>
        ))}
        <div className="ml-2 text-sm text-[var(--foreground-muted)]">
          {step === 'trim' && 'Step 1: Trim'}
          {step === 'setup' && 'Step 2: Setup'}
          {step === 'annotate' && 'Step 3: Annotate'}
          {step === 'complete' && 'Done!'}
        </div>
      </div>

      {/* Step content */}
      {step === 'trim' && video && (
        <VideoTrimmer
          videoUrl={video.playbackUrl}
          duration={video.duration || 0}
          initialStartTime={video.startTime ?? undefined}
          initialEndTime={video.endTime ?? undefined}
          onSave={handleSaveTrim}
        />
      )}

      {step === 'setup' && video && (
        <div className="card p-6 space-y-6">
          <div>
            <h3 className="font-semibold mb-2">🎯 Tag Players</h3>
            <p className="text-sm text-[var(--foreground-muted)] mb-4">
              Click on each player in the video to identify them
            </p>
            
            {/* Video preview */}
            <div className="relative bg-black rounded-lg overflow-hidden mb-4">
              <video
                src={video.playbackUrl}
                className="w-full aspect-video"
                controls
                playsInline
              />
            </div>

            {/* Player buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              {allPlayers.map((player) => {
                const tagged = video.playerTags.find((t) => t.playerId === player.id)
                return (
                  <button
                    key={player.id}
                    className={`px-3 py-2 rounded-lg text-sm transition-all ${
                      tagged
                        ? 'text-black font-medium'
                        : 'bg-[var(--background-elevated)]'
                    }`}
                    style={tagged ? { backgroundColor: tagged.color } : undefined}
                    disabled={!!tagged}
                  >
                    {player.emoji} {player.name}
                    {tagged && ' ✓'}
                  </button>
                )
              })}
            </div>

            <p className="text-xs text-[var(--foreground-muted)]">
              Tagged: {video.playerTags.length} / {allPlayers.length} players
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">🏐 Mark the Net</h3>
            <p className="text-sm text-[var(--foreground-muted)]">
              {video.netX1 !== null
                ? '✅ Net position saved'
                : 'Draw a box around the net in the video'}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep('trim')}
              className="btn btn-secondary flex-1"
            >
              ← Back to Trim
            </button>
            <button
              onClick={() => setStep('annotate')}
              disabled={video.playerTags.length < 2}
              className="btn btn-primary flex-1"
            >
              Continue to Annotate →
            </button>
          </div>

          <p className="text-xs text-[var(--foreground-muted)] text-center">
            Note: Full setup UI with MediaPipe player tracking coming soon!
            For now, proceed to annotation.
          </p>
        </div>
      )}

      {step === 'annotate' && video && (
        <div className="card p-6 space-y-4">
          <div className="relative bg-black rounded-lg overflow-hidden">
            <video
              src={video.playbackUrl}
              className="w-full aspect-video"
              controls
              playsInline
            />
          </div>

          <div className="text-center py-8">
            <p className="text-4xl mb-4">🚧</p>
            <h3 className="font-semibold mb-2">Annotation UI Coming Soon</h3>
            <p className="text-sm text-[var(--foreground-muted)] mb-4">
              This is where you&apos;ll mark passes, spikes, and points.
              <br />
              MediaPipe will auto-track player positions.
            </p>
            <p className="text-sm">
              Annotations so far: {video._count.annotations}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep('setup')}
              className="btn btn-secondary flex-1"
            >
              ← Back to Setup
            </button>
            <Link
              href={`/sessions/${game?.session?.id || ''}`}
              className="btn btn-primary flex-1 text-center"
            >
              Done for Now →
            </Link>
          </div>
        </div>
      )}

      {step === 'complete' && (
        <div className="card p-6 text-center">
          <p className="text-4xl mb-4">🎉</p>
          <h3 className="font-semibold mb-2">Annotation Complete!</h3>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">
            {video?._count.annotations || 0} annotations recorded
          </p>
          <Link
            href={`/sessions/${game?.session?.id || ''}`}
            className="btn btn-primary"
          >
            ← Back to Session
          </Link>
        </div>
      )}
    </div>
  )
}
