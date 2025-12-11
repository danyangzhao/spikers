'use client'

type RSVPStatus = 'GOING' | 'MAYBE' | 'OUT' | null

interface RSVPButtonProps {
  currentStatus: RSVPStatus
  onStatusChange: (status: 'GOING' | 'MAYBE' | 'OUT') => void
  disabled?: boolean
}

const statusConfig = {
  GOING: { 
    label: 'Going', 
    emoji: '✅', 
    activeClass: 'bg-[var(--accent-success)] text-black ring-[var(--accent-success)]' 
  },
  MAYBE: { 
    label: 'Maybe', 
    emoji: '🤔', 
    activeClass: 'bg-[var(--accent-primary)] text-black ring-[var(--accent-primary)]' 
  },
  OUT: { 
    label: 'Out', 
    emoji: '❌', 
    activeClass: 'bg-[var(--accent-danger)] text-black ring-[var(--accent-danger)]' 
  },
}

export default function RSVPButton({
  currentStatus,
  onStatusChange,
  disabled = false,
}: RSVPButtonProps) {
  return (
    <div className="flex gap-2">
      {(Object.keys(statusConfig) as Array<'GOING' | 'MAYBE' | 'OUT'>).map((status) => {
        const config = statusConfig[status]
        const isActive = currentStatus === status

        return (
          <button
            key={status}
            onClick={() => onStatusChange(status)}
            disabled={disabled}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? `ring-2 ring-offset-2 ring-offset-[var(--background)] ${config.activeClass}`
                : 'bg-[var(--background-elevated)] text-[var(--foreground)] opacity-60 hover:opacity-100'
            } ${disabled ? 'cursor-not-allowed' : ''}`}
          >
            <span className="mr-1">{config.emoji}</span>
            {config.label}
          </button>
        )
      })}
    </div>
  )
}
