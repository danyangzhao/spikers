'use client'

import { useState } from 'react'

interface Player {
  id: string
  name: string
  emoji: string
}

type AnnotationMode = 'none' | 'pass' | 'spike' | 'point_won' | 'point_lost'

const POINT_REASONS = [
  { id: 'SERVE_ACE', label: '🎯 Serve Ace' },
  { id: 'GREAT_SPIKE', label: '💥 Great Spike' },
  { id: 'OPPONENT_ERROR', label: '❌ Opponent Error' },
  { id: 'FAILED_RETURN', label: '🚫 Failed Return' },
  { id: 'NET_VIOLATION', label: '🕸️ Net Violation' },
  { id: 'OUT_OF_BOUNDS', label: '📍 Out of Bounds' },
  { id: 'OTHER', label: '❓ Other' },
]

interface AnnotationToolbarProps {
  players: Player[]
  currentMode: AnnotationMode
  onModeChange: (mode: AnnotationMode) => void
  onAnnotate: (type: string, playerId?: string, extra?: Record<string, unknown>) => void
  disabled?: boolean
  recentAnnotations?: Array<{
    type: string
    playerName?: string
    time: number
  }>
}

export default function AnnotationToolbar({
  players,
  currentMode,
  onModeChange,
  onAnnotate,
  disabled = false,
  recentAnnotations = [],
}: AnnotationToolbarProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [showReasonPicker, setShowReasonPicker] = useState(false)
  const [pendingPointType, setPendingPointType] = useState<'POINT_WON' | 'POINT_LOST' | null>(null)

  const handleModeClick = (mode: AnnotationMode) => {
    if (currentMode === mode) {
      onModeChange('none')
      setSelectedPlayer(null)
    } else {
      onModeChange(mode)
      setSelectedPlayer(null)
    }
  }

  const handlePlayerClick = (playerId: string) => {
    if (currentMode === 'pass') {
      onAnnotate('PASS', playerId)
      setSelectedPlayer(null)
      onModeChange('none')
    } else if (currentMode === 'spike') {
      // For spike, we need to ask if it was successful
      setSelectedPlayer(playerId)
    }
  }

  const handleSpikeResult = (successful: boolean) => {
    if (selectedPlayer) {
      onAnnotate('SPIKE', selectedPlayer, { successful })
      setSelectedPlayer(null)
      onModeChange('none')
    }
  }

  const handlePointClick = (type: 'POINT_WON' | 'POINT_LOST') => {
    setPendingPointType(type)
    setShowReasonPicker(true)
  }

  const handleReasonSelect = (reason: string) => {
    if (pendingPointType) {
      onAnnotate(pendingPointType, undefined, { reason })
      setPendingPointType(null)
      setShowReasonPicker(false)
      onModeChange('none')
    }
  }

  return (
    <div className="space-y-4">
      {/* Main action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleModeClick('pass')}
          disabled={disabled}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            currentMode === 'pass'
              ? 'bg-blue-500 text-white'
              : 'bg-[var(--background-elevated)] hover:bg-white/10'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          🤝 Pass
        </button>

        <button
          onClick={() => handleModeClick('spike')}
          disabled={disabled}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            currentMode === 'spike'
              ? 'bg-orange-500 text-white'
              : 'bg-[var(--background-elevated)] hover:bg-white/10'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          💥 Spike
        </button>

        <button
          onClick={() => handlePointClick('POINT_WON')}
          disabled={disabled}
          className={`px-4 py-2 rounded-lg font-medium transition-all bg-green-600 hover:bg-green-500 text-white ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          ✅ Point Won
        </button>

        <button
          onClick={() => handlePointClick('POINT_LOST')}
          disabled={disabled}
          className={`px-4 py-2 rounded-lg font-medium transition-all bg-red-600 hover:bg-red-500 text-white ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          ❌ Point Lost
        </button>
      </div>

      {/* Player selector (shown when pass or spike mode is active) */}
      {(currentMode === 'pass' || currentMode === 'spike') && !selectedPlayer && (
        <div className="card p-3 animate-fade-in">
          <p className="text-sm text-[var(--foreground-muted)] mb-2">
            Select player who {currentMode === 'pass' ? 'passed' : 'spiked'}:
          </p>
          <div className="flex flex-wrap gap-2">
            {players.map((player) => (
              <button
                key={player.id}
                onClick={() => handlePlayerClick(player.id)}
                className="px-3 py-2 rounded-lg bg-[var(--background-elevated)] hover:bg-white/10 transition-all"
              >
                {player.emoji} {player.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Spike result picker */}
      {currentMode === 'spike' && selectedPlayer && (
        <div className="card p-3 animate-fade-in">
          <p className="text-sm text-[var(--foreground-muted)] mb-2">
            Did the spike reach the net?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleSpikeResult(true)}
              className="flex-1 px-4 py-3 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium"
            >
              ✅ Yes
            </button>
            <button
              onClick={() => handleSpikeResult(false)}
              className="flex-1 px-4 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium"
            >
              ❌ No
            </button>
          </div>
        </div>
      )}

      {/* Point reason picker */}
      {showReasonPicker && (
        <div className="card p-3 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-[var(--foreground-muted)]">
              Why was the point {pendingPointType === 'POINT_WON' ? 'won' : 'lost'}?
            </p>
            <button
              onClick={() => {
                setShowReasonPicker(false)
                setPendingPointType(null)
              }}
              className="text-sm text-[var(--foreground-muted)]"
            >
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {POINT_REASONS.map((reason) => (
              <button
                key={reason.id}
                onClick={() => handleReasonSelect(reason.id)}
                className="px-3 py-2 rounded-lg bg-[var(--background-elevated)] hover:bg-white/10 text-left text-sm transition-all"
              >
                {reason.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent annotations */}
      {recentAnnotations.length > 0 && (
        <div className="text-xs text-[var(--foreground-muted)]">
          <p className="mb-1">Recent:</p>
          <div className="flex flex-wrap gap-1">
            {recentAnnotations.slice(0, 5).map((ann, i) => (
              <span
                key={i}
                className="px-2 py-1 bg-[var(--background-elevated)] rounded"
              >
                {ann.type === 'PASS' && '🤝'}
                {ann.type === 'SPIKE' && '💥'}
                {ann.type === 'POINT_WON' && '✅'}
                {ann.type === 'POINT_LOST' && '❌'}
                {ann.playerName && ` ${ann.playerName}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      <div className="text-xs text-[var(--foreground-muted)] flex flex-wrap gap-2">
        <span>Shortcuts:</span>
        <span><kbd className="px-1 bg-[var(--background-elevated)] rounded">P</kbd> Pass</span>
        <span><kbd className="px-1 bg-[var(--background-elevated)] rounded">S</kbd> Spike</span>
        <span><kbd className="px-1 bg-[var(--background-elevated)] rounded">W</kbd> Won</span>
        <span><kbd className="px-1 bg-[var(--background-elevated)] rounded">L</kbd> Lost</span>
        <span><kbd className="px-1 bg-[var(--background-elevated)] rounded">Space</kbd> Play/Pause</span>
      </div>
    </div>
  )
}
