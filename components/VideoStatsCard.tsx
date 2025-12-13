'use client'

interface VideoStatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: string
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple'
}

export default function VideoStatsCard({
  title,
  value,
  subtitle,
  icon,
  color = 'blue',
}: VideoStatsCardProps) {
  const colorClasses = {
    blue: 'bg-blue-500/20 text-blue-400',
    green: 'bg-green-500/20 text-green-400',
    orange: 'bg-orange-500/20 text-orange-400',
    red: 'bg-red-500/20 text-red-400',
    purple: 'bg-purple-500/20 text-purple-400',
  }

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${colorClasses[color]}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--foreground-muted)]">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subtitle && (
            <p className="text-xs text-[var(--foreground-muted)]">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  )
}

interface VideoStatsGridProps {
  lateralDistance: {
    distanceFeet: number
    distanceMiles: number
  }
  passCount: {
    avgPassesPerRally: number
    totalPasses: number
    totalRallies: number
  }
  spikeAccuracy: {
    successful: number
    total: number
    percentage: number
  }
  pointOutcomes: {
    totalWon: number
    totalLost: number
    total: number
    winPercentage: number
  }
  gamesAnalyzed?: number
}

export function VideoStatsGrid({
  lateralDistance,
  passCount,
  spikeAccuracy,
  pointOutcomes,
  gamesAnalyzed,
}: VideoStatsGridProps) {
  return (
    <div className="space-y-4">
      {gamesAnalyzed !== undefined && (
        <p className="text-sm text-[var(--foreground-muted)]">
          Based on {gamesAnalyzed} game{gamesAnalyzed !== 1 ? 's' : ''} with video
        </p>
      )}
      
      <div className="grid grid-cols-2 gap-3">
        <VideoStatsCard
          icon="🏃"
          title="Distance"
          value={`${lateralDistance.distanceMiles.toFixed(2)} mi`}
          subtitle={`${lateralDistance.distanceFeet.toFixed(0)} feet`}
          color="blue"
        />
        
        <VideoStatsCard
          icon="🤝"
          title="Avg Passes/Rally"
          value={passCount.avgPassesPerRally.toFixed(1)}
          subtitle={`${passCount.totalPasses} passes, ${passCount.totalRallies} rallies`}
          color="green"
        />
        
        <VideoStatsCard
          icon="💥"
          title="Spike Accuracy"
          value={`${spikeAccuracy.percentage}%`}
          subtitle={`${spikeAccuracy.successful}/${spikeAccuracy.total} successful`}
          color="orange"
        />
        
        <VideoStatsCard
          icon="🎯"
          title="Win Rate"
          value={`${pointOutcomes.winPercentage}%`}
          subtitle={`${pointOutcomes.totalWon}W - ${pointOutcomes.totalLost}L`}
          color={pointOutcomes.winPercentage >= 50 ? 'green' : 'red'}
        />
      </div>
    </div>
  )
}

interface PointBreakdownProps {
  won: Record<string, number>
  lost: Record<string, number>
}

const REASON_LABELS: Record<string, string> = {
  SERVE_ACE: '🎯 Serve Ace',
  GREAT_SPIKE: '💥 Great Spike',
  OPPONENT_ERROR: '❌ Opponent Error',
  FAILED_RETURN: '🚫 Failed Return',
  NET_VIOLATION: '🕸️ Net Violation',
  OUT_OF_BOUNDS: '📍 Out of Bounds',
  OTHER: '❓ Other',
}

export function PointBreakdown({ won, lost }: PointBreakdownProps) {
  const reasons = Object.keys(REASON_LABELS)
  
  const hasData = reasons.some((r) => (won[r] || 0) + (lost[r] || 0) > 0)
  
  if (!hasData) {
    return (
      <div className="card p-4">
        <h4 className="font-semibold mb-2">Point Breakdown</h4>
        <p className="text-sm text-[var(--foreground-muted)]">
          No point data recorded yet
        </p>
      </div>
    )
  }

  return (
    <div className="card p-4">
      <h4 className="font-semibold mb-3">Point Breakdown</h4>
      <div className="space-y-2">
        {reasons.map((reason) => {
          const w = won[reason] || 0
          const l = lost[reason] || 0
          const total = w + l
          if (total === 0) return null
          
          const winPercent = (w / total) * 100
          
          return (
            <div key={reason} className="text-sm">
              <div className="flex justify-between mb-1">
                <span>{REASON_LABELS[reason]}</span>
                <span className="text-[var(--foreground-muted)]">
                  {w}W / {l}L
                </span>
              </div>
              <div className="h-2 bg-[var(--background-elevated)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${winPercent}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
