'use client'

import { useState, useEffect, use, useCallback, useRef } from 'react'
import Link from 'next/link'
import VideoTrimmer from '@/components/VideoTrimmer'
import AnnotationToolbar from '@/components/AnnotationToolbar'
import MediaPipeOverlay from '@/components/MediaPipeOverlay'
import { DetectedPerson } from '@/lib/mediapipe'

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

interface Annotation {
  id: string
  type: string
  frameTime: number
  playerId?: string
  player?: Player
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
type AnnotationMode = 'none' | 'pass' | 'spike' | 'point_won' | 'point_lost'

const PLAYER_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444']

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

  // Setup state
  const [selectedPlayerForTag, setSelectedPlayerForTag] = useState<string | null>(null)
  const [tagConfirmation, setTagConfirmation] = useState<{
    x: number
    y: number
    playerName: string
    color: string
  } | null>(null)

  // Annotation state
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>('none')
  const [recentAnnotations, setRecentAnnotations] = useState<Annotation[]>([])
  const [annotationCount, setAnnotationCount] = useState(0)

  // Player positions from MediaPipe
  const [playerPositions, setPlayerPositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  
  // Accumulate position data for batch saving
  const positionBufferRef = useRef<Array<{
    frameTime: number
    playerId: string
    x: number
    y: number
  }>>([])
  const lastSaveTimeRef = useRef<number>(0)

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
        setAnnotationCount(videoData._count.annotations)
        
        // Determine which step we're on based on video status
        if (videoData.status === 'UPLOADED') {
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

  const fetchRecentAnnotations = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}/video/annotations`)
      if (res.ok) {
        const anns = await res.json()
        setRecentAnnotations(anns.slice(-10).reverse())
        setAnnotationCount(anns.length)
      }
    } catch (err) {
      console.error('Failed to fetch annotations:', err)
    }
  }, [gameId])

  useEffect(() => {
    fetchGame()
    fetchVideo()
  }, [fetchGame, fetchVideo])

  useEffect(() => {
    if (step === 'annotate') {
      fetchRecentAnnotations()
    }
  }, [step, fetchRecentAnnotations])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (step !== 'annotate') return
      
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault()
          if (videoRef.current) {
            if (videoRef.current.paused) {
              videoRef.current.play()
            } else {
              videoRef.current.pause()
            }
          }
          break
        case 'p':
          setAnnotationMode('pass')
          break
        case 's':
          setAnnotationMode('spike')
          break
        case 'w':
          setAnnotationMode('point_won')
          break
        case 'l':
          setAnnotationMode('point_lost')
          break
        case 'escape':
          setAnnotationMode('none')
          break
        case 'arrowleft':
          if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - (e.shiftKey ? 0.1 : 1))
          }
          break
        case 'arrowright':
          if (videoRef.current) {
            videoRef.current.currentTime += e.shiftKey ? 0.1 : 1
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [step])

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

  const handleTagPlayer = async (playerId: string, x: number, y: number) => {
    try {
      const res = await fetch(`/api/games/${gameId}/video/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, initialX: x, initialY: y }),
      })

      if (res.ok) {
        await fetchVideo()
        setSelectedPlayerForTag(null)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to tag player')
      }
    } catch (err) {
      console.error('Failed to tag player:', err)
      setError('Failed to tag player')
    }
  }

  const handlePersonClick = (person: DetectedPerson) => {
    if (selectedPlayerForTag && allPlayers) {
      const player = allPlayers.find(p => p.id === selectedPlayerForTag)
      const playerIndex = allPlayers.findIndex(p => p.id === selectedPlayerForTag)
      
      if (player) {
        // Show confirmation animation
        setTagConfirmation({
          x: person.x,
          y: person.y,
          playerName: `${player.emoji} ${player.name}`,
          color: PLAYER_COLORS[playerIndex % PLAYER_COLORS.length],
        })
        
        // Clear confirmation after animation
        setTimeout(() => setTagConfirmation(null), 1500)
      }
      
      handleTagPlayer(selectedPlayerForTag, person.x, person.y)
    }
  }

  const handleCompleteSetup = async () => {
    try {
      // Save default net position if not set
      if (video && video.netX1 === null) {
        await fetch(`/api/games/${gameId}/video/setup`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            netX1: 0.4,
            netY1: 0.4,
            netX2: 0.6,
            netY2: 0.6,
          }),
        })
      }

      // Mark setup complete
      await fetch(`/api/games/${gameId}/video/setup`, {
        method: 'POST',
      })

      await fetchVideo()
    } catch (err) {
      console.error('Failed to complete setup:', err)
      setError('Failed to complete setup')
    }
  }

  const handleAnnotate = async (
    type: string,
    playerId?: string,
    extra?: Record<string, unknown>
  ) => {
    try {
      const res = await fetch(`/api/games/${gameId}/video/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frameTime: currentTime,
          type,
          playerId,
          ...extra,
        }),
      })

      if (res.ok) {
        const newAnn = await res.json()
        setRecentAnnotations((prev) => [newAnn, ...prev.slice(0, 9)])
        setAnnotationCount((prev) => prev + 1)
      }
    } catch (err) {
      console.error('Failed to create annotation:', err)
    }
  }

  // Save accumulated position data to the database
  const savePositionBuffer = useCallback(async () => {
    if (positionBufferRef.current.length === 0) return
    
    const positions = [...positionBufferRef.current]
    positionBufferRef.current = [] // Clear buffer
    
    try {
      const annotations = positions.map(pos => ({
        frameTime: pos.frameTime,
        type: 'PLAYER_POSITION',
        playerId: pos.playerId,
        x: pos.x,
        y: pos.y,
      }))
      
      await fetch(`/api/games/${gameId}/video/annotations/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations }),
      })
      
      console.log(`Saved ${annotations.length} position annotations`)
    } catch (err) {
      console.error('Failed to save positions:', err)
      // Re-add to buffer on failure
      positionBufferRef.current = [...positions, ...positionBufferRef.current]
    }
  }, [gameId])

  // Handle position updates from MediaPipe
  const handlePlayerPositionsUpdate = useCallback((positions: Map<string, { x: number; y: number }>) => {
    setPlayerPositions(positions)
    
    // Add positions to buffer with current video time
    const currentVideoTime = videoRef.current?.currentTime || 0
    
    positions.forEach((pos, playerId) => {
      positionBufferRef.current.push({
        frameTime: currentVideoTime,
        playerId,
        x: pos.x,
        y: pos.y,
      })
    })
    
    // Save buffer every 5 seconds
    const now = Date.now()
    if (now - lastSaveTimeRef.current > 5000) {
      lastSaveTimeRef.current = now
      savePositionBuffer()
    }
  }, [savePositionBuffer])

  // Save remaining positions when video pauses or component unmounts
  useEffect(() => {
    if (!isPlaying && positionBufferRef.current.length > 0) {
      savePositionBuffer()
    }
  }, [isPlaying, savePositionBuffer])

  const handleMarkComplete = async () => {
    // Save any remaining position data first
    await savePositionBuffer()
    
    try {
      await fetch(`/api/games/${gameId}/video`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ANNOTATED' }),
      })
      setStep('complete')
    } catch (err) {
      console.error('Failed to mark complete:', err)
    }
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
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
  const taggedPlayers = video?.playerTags.map((t) => ({
    playerId: t.playerId,
    player: t.player,
    color: t.color,
    lastPosition: { x: t.initialX, y: t.initialY },
  })) || []

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
            {step === 'setup' && '🎯 Setup Players'}
            {step === 'annotate' && '📝 Annotate Game'}
            {step === 'complete' && '✅ Annotation Complete'}
          </h1>
          {game && (
            <p className="text-sm text-[var(--foreground-muted)]">
              Game from {formatDate(game.session.date)} • {game.scoreA}-{game.scoreB}
            </p>
          )}
        </div>
        {step === 'annotate' && (
          <div className="text-sm text-[var(--foreground-muted)]">
            {annotationCount} annotations
          </div>
        )}
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

      {/* Step 1: Trim */}
      {step === 'trim' && video && (
        <VideoTrimmer
          videoUrl={video.playbackUrl}
          duration={video.duration || 0}
          initialStartTime={video.startTime ?? undefined}
          initialEndTime={video.endTime ?? undefined}
          onSave={handleSaveTrim}
        />
      )}

      {/* Step 2: Setup */}
      {step === 'setup' && video && (
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="font-semibold mb-2">🎯 Tag Players in Video</h3>
            <p className="text-sm text-[var(--foreground-muted)] mb-4">
              {selectedPlayerForTag
                ? `Click on ${allPlayers.find((p) => p.id === selectedPlayerForTag)?.name} in the video`
                : 'Select a player below, then click on them in the video'}
            </p>

            {/* Video with MediaPipe overlay */}
            <div className="relative bg-black rounded-lg overflow-hidden mb-4 aspect-video">
            <video
              ref={videoRef}
              src={video.playbackUrl}
              crossOrigin="anonymous"
              className="w-full h-full"
              onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              controls
              playsInline
            />
              <MediaPipeOverlay
                videoRef={videoRef}
                isPlaying={isPlaying}
                taggedPlayers={taggedPlayers}
                onPersonClick={selectedPlayerForTag ? handlePersonClick : undefined}
              />
              
              {/* Tag confirmation animation */}
              {tagConfirmation && (
                <div 
                  className="absolute pointer-events-none animate-ping"
                  style={{
                    left: `${tagConfirmation.x * 100}%`,
                    top: `${tagConfirmation.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div 
                    className="w-16 h-16 rounded-full border-4 opacity-75"
                    style={{ borderColor: tagConfirmation.color }}
                  />
                </div>
              )}
              
              {/* Tag confirmation label */}
              {tagConfirmation && (
                <div 
                  className="absolute pointer-events-none animate-bounce"
                  style={{
                    left: `${tagConfirmation.x * 100}%`,
                    top: `${tagConfirmation.y * 100}%`,
                    transform: 'translate(-50%, -120%)',
                  }}
                >
                  <div 
                    className="px-3 py-1 rounded-full text-sm font-bold text-black whitespace-nowrap"
                    style={{ backgroundColor: tagConfirmation.color }}
                  >
                    ✓ {tagConfirmation.playerName}
                  </div>
                </div>
              )}
            </div>

            {/* Player selection buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              {allPlayers.map((player, i) => {
                const tagged = video.playerTags.find((t) => t.playerId === player.id)
                const isSelected = selectedPlayerForTag === player.id
                return (
                  <button
                    key={player.id}
                    onClick={() => setSelectedPlayerForTag(isSelected ? null : player.id)}
                    disabled={!!tagged}
                    className={`px-3 py-2 rounded-lg text-sm transition-all ${
                      tagged
                        ? 'text-black font-medium cursor-not-allowed'
                        : isSelected
                        ? 'ring-2 ring-white'
                        : 'bg-[var(--background-elevated)] hover:bg-white/10'
                    }`}
                    style={{
                      backgroundColor: tagged
                        ? tagged.color
                        : isSelected
                        ? PLAYER_COLORS[i % PLAYER_COLORS.length]
                        : undefined,
                    }}
                  >
                    {player.emoji} {player.name}
                    {tagged && ' ✓'}
                  </button>
                )
              })}
            </div>

            <p className="text-xs text-[var(--foreground-muted)]">
              Tagged: {video.playerTags.length} / {allPlayers.length} players
              {video.playerTags.length < 2 && ' (need at least 2)'}
            </p>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep('trim')} className="btn btn-secondary flex-1">
              ← Back
            </button>
            <button
              onClick={handleCompleteSetup}
              disabled={video.playerTags.length < 2}
              className="btn btn-primary flex-1"
            >
              Continue to Annotate →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Annotate */}
      {step === 'annotate' && video && (
        <div className="space-y-4">
          {/* Video player with overlay */}
          <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
            <video
              ref={videoRef}
              src={video.playbackUrl}
              crossOrigin="anonymous"
              className="w-full h-full"
              onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              playsInline
            />
            <MediaPipeOverlay
              videoRef={videoRef}
              isPlaying={isPlaying}
              taggedPlayers={taggedPlayers}
              onPlayerPositionsUpdate={handlePlayerPositionsUpdate}
            />
          </div>

          {/* Video controls */}
          <div className="card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono">{formatTime(currentTime)}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = Math.max(0, currentTime - 5)
                    }
                  }}
                  className="btn btn-ghost p-1 text-sm"
                >
                  -5s
                </button>
                <button
                  onClick={() => {
                    if (videoRef.current) {
                      if (isPlaying) videoRef.current.pause()
                      else videoRef.current.play()
                    }
                  }}
                  className="btn btn-primary px-4"
                >
                  {isPlaying ? '⏸️' : '▶️'}
                </button>
                <button
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = currentTime + 5
                    }
                  }}
                  className="btn btn-ghost p-1 text-sm"
                >
                  +5s
                </button>
              </div>
              <span className="text-sm font-mono text-[var(--foreground-muted)]">
                {formatTime(video.duration || 0)}
              </span>
            </div>

            {/* Timeline scrubber */}
            <input
              type="range"
              min={video.startTime || 0}
              max={video.endTime || video.duration || 100}
              step={0.1}
              value={currentTime}
              onChange={(e) => {
                if (videoRef.current) {
                  videoRef.current.currentTime = parseFloat(e.target.value)
                }
              }}
              className="w-full"
            />
          </div>

          {/* Annotation toolbar */}
          <div className="card p-4">
            <AnnotationToolbar
              players={allPlayers}
              currentMode={annotationMode}
              onModeChange={(mode) => {
                // Auto-pause video when starting to annotate
                if (mode !== 'none' && videoRef.current && !videoRef.current.paused) {
                  videoRef.current.pause()
                }
                setAnnotationMode(mode)
              }}
              onAnnotate={handleAnnotate}
              recentAnnotations={recentAnnotations.map((a) => ({
                type: a.type,
                playerName: a.player?.name,
                time: a.frameTime,
              }))}
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={() => setStep('setup')} className="btn btn-secondary flex-1">
              ← Back to Setup
            </button>
            <button onClick={handleMarkComplete} className="btn btn-primary flex-1">
              ✅ Mark Complete
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && (
        <div className="card p-6 text-center">
          <p className="text-4xl mb-4">🎉</p>
          <h3 className="font-semibold mb-2">Annotation Complete!</h3>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">
            {annotationCount} annotations recorded
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => setStep('annotate')}
              className="btn btn-secondary"
            >
              ✏️ Edit Annotations
            </button>
            <Link
              href={`/sessions/${game?.session?.id || ''}`}
              className="btn btn-primary"
            >
              ← Back to Session
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
