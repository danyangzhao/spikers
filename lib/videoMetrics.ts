/**
 * Video Metrics Computation
 *
 * Calculates 4 MVP metrics from video annotations:
 * 1. Lateral Distance - Total horizontal movement
 * 2. Pass Count - Average passes per rally between teammates
 * 3. Spike Accuracy - Percentage of spikes that reached the net
 * 4. Point Outcomes - Breakdown of why points were won/lost
 */

import { AnnotationType, PointReason } from '@prisma/client'

// Types for annotations passed to these functions
interface Annotation {
  id: string
  frameTime: number
  type: AnnotationType
  playerId: string | null
  x: number | null
  y: number | null
  successful: boolean | null
  reason: PointReason | null
}

// ============================================
// 1. Lateral Distance
// ============================================

interface LateralDistanceResult {
  distanceFeet: number
  distanceMiles: number
  positionCount: number
}

/**
 * Calculate total lateral (horizontal) distance traveled by a player.
 *
 * @param annotations - All annotations for the video
 * @param playerId - The player to calculate for
 * @param fieldWidthFeet - Approximate width of playing field in feet (default 20ft for spikeball)
 * @returns Distance in feet and miles
 */
export function calculateLateralDistance(
  annotations: Annotation[],
  playerId: string,
  fieldWidthFeet: number = 20
): LateralDistanceResult {
  // Filter to PLAYER_POSITION annotations for this player, sorted by time
  const positions = annotations
    .filter((a) => a.type === 'PLAYER_POSITION' && a.playerId === playerId && a.x !== null)
    .sort((a, b) => a.frameTime - b.frameTime)

  if (positions.length < 2) {
    return { distanceFeet: 0, distanceMiles: 0, positionCount: positions.length }
  }

  // Sum horizontal distance between consecutive positions
  let totalNormalizedDistance = 0
  for (let i = 1; i < positions.length; i++) {
    const dx = Math.abs((positions[i].x ?? 0) - (positions[i - 1].x ?? 0))
    totalNormalizedDistance += dx
  }

  // Convert normalized distance to feet
  // Normalized coords are 0-1, so multiply by field width
  const distanceFeet = totalNormalizedDistance * fieldWidthFeet

  // Convert to miles (5280 feet per mile)
  const distanceMiles = distanceFeet / 5280

  return {
    distanceFeet: Math.round(distanceFeet * 10) / 10, // Round to 1 decimal
    distanceMiles: Math.round(distanceMiles * 1000) / 1000, // Round to 3 decimals
    positionCount: positions.length,
  }
}

// ============================================
// 2. Pass Count
// ============================================

interface PassCountResult {
  avgPassesPerRally: number
  totalPasses: number
  totalRallies: number
  passBreakdown: Array<{
    playerId: string
    passes: number
  }>
}

/**
 * Calculate average passes per rally and pass distribution.
 *
 * A "rally" is the time between POINT_WON/POINT_LOST events.
 *
 * @param annotations - All annotations for the video
 * @param teamPlayerIds - IDs of the team's players (to count only their passes)
 * @returns Pass statistics
 */
export function calculatePassCount(
  annotations: Annotation[],
  teamPlayerIds?: string[]
): PassCountResult {
  // Sort by time
  const sorted = [...annotations].sort((a, b) => a.frameTime - b.frameTime)

  // Split into rallies based on point events
  const rallies: Annotation[][] = []
  let currentRally: Annotation[] = []

  for (const ann of sorted) {
    if (ann.type === 'POINT_WON' || ann.type === 'POINT_LOST') {
      if (currentRally.length > 0) {
        rallies.push(currentRally)
      }
      currentRally = []
    } else {
      currentRally.push(ann)
    }
  }
  // Don't forget the last rally if it didn't end with a point
  if (currentRally.length > 0) {
    rallies.push(currentRally)
  }

  // Count passes per rally
  let totalPasses = 0
  const passCountByPlayer: Record<string, number> = {}

  for (const rally of rallies) {
    const passes = rally.filter((a) => {
      if (a.type !== 'PASS') return false
      if (!a.playerId) return false
      if (teamPlayerIds && !teamPlayerIds.includes(a.playerId)) return false
      return true
    })

    totalPasses += passes.length

    for (const pass of passes) {
      if (pass.playerId) {
        passCountByPlayer[pass.playerId] = (passCountByPlayer[pass.playerId] || 0) + 1
      }
    }
  }

  const totalRallies = rallies.length
  const avgPassesPerRally = totalRallies > 0 ? totalPasses / totalRallies : 0

  const passBreakdown = Object.entries(passCountByPlayer)
    .map(([playerId, passes]) => ({ playerId, passes }))
    .sort((a, b) => b.passes - a.passes)

  return {
    avgPassesPerRally: Math.round(avgPassesPerRally * 10) / 10,
    totalPasses,
    totalRallies,
    passBreakdown,
  }
}

// ============================================
// 3. Spike Accuracy
// ============================================

interface SpikeAccuracyResult {
  successful: number
  total: number
  percentage: number
}

/**
 * Calculate spike accuracy for a player.
 *
 * @param annotations - All annotations for the video
 * @param playerId - The player to calculate for (optional, calculates for all if not provided)
 * @returns Spike accuracy statistics
 */
export function calculateSpikeAccuracy(
  annotations: Annotation[],
  playerId?: string
): SpikeAccuracyResult {
  const spikes = annotations.filter((a) => {
    if (a.type !== 'SPIKE') return false
    if (playerId && a.playerId !== playerId) return false
    return true
  })

  const successful = spikes.filter((s) => s.successful === true).length
  const total = spikes.length
  const percentage = total > 0 ? (successful / total) * 100 : 0

  return {
    successful,
    total,
    percentage: Math.round(percentage),
  }
}

// ============================================
// 4. Point Outcomes
// ============================================

interface PointOutcomesResult {
  won: Record<PointReason, number>
  lost: Record<PointReason, number>
  totalWon: number
  totalLost: number
  total: number
  winPercentage: number
}

/**
 * Calculate point outcome breakdown.
 *
 * @param annotations - All annotations for the video
 * @returns Point outcome statistics
 */
export function calculatePointOutcomes(
  annotations: Annotation[]
): PointOutcomesResult {
  const pointAnnotations = annotations.filter(
    (a) => a.type === 'POINT_WON' || a.type === 'POINT_LOST'
  )

  // Initialize counters for all reasons
  const reasons: PointReason[] = [
    'SERVE_ACE',
    'GREAT_SPIKE',
    'OPPONENT_ERROR',
    'FAILED_RETURN',
    'NET_VIOLATION',
    'OUT_OF_BOUNDS',
    'OTHER',
  ]

  const won: Record<string, number> = {}
  const lost: Record<string, number> = {}

  for (const reason of reasons) {
    won[reason] = 0
    lost[reason] = 0
  }

  // Count by reason
  for (const point of pointAnnotations) {
    const reason = point.reason || 'OTHER'
    if (point.type === 'POINT_WON') {
      won[reason] = (won[reason] || 0) + 1
    } else {
      lost[reason] = (lost[reason] || 0) + 1
    }
  }

  const totalWon = pointAnnotations.filter((p) => p.type === 'POINT_WON').length
  const totalLost = pointAnnotations.filter((p) => p.type === 'POINT_LOST').length
  const total = totalWon + totalLost
  const winPercentage = total > 0 ? (totalWon / total) * 100 : 0

  return {
    won: won as Record<PointReason, number>,
    lost: lost as Record<PointReason, number>,
    totalWon,
    totalLost,
    total,
    winPercentage: Math.round(winPercentage),
  }
}

// ============================================
// Aggregate Metrics
// ============================================

interface GameMetrics {
  lateralDistance: Record<string, LateralDistanceResult>
  passCount: PassCountResult
  spikeAccuracy: {
    overall: SpikeAccuracyResult
    byPlayer: Record<string, SpikeAccuracyResult>
  }
  pointOutcomes: PointOutcomesResult
}

/**
 * Calculate all metrics for a game.
 *
 * @param annotations - All annotations for the video
 * @param playerIds - All player IDs in the game
 * @param fieldWidthFeet - Field width for distance calculation
 * @returns All game metrics
 */
export function calculateGameMetrics(
  annotations: Annotation[],
  playerIds: string[],
  fieldWidthFeet: number = 20
): GameMetrics {
  // Lateral distance per player
  const lateralDistance: Record<string, LateralDistanceResult> = {}
  for (const playerId of playerIds) {
    lateralDistance[playerId] = calculateLateralDistance(
      annotations,
      playerId,
      fieldWidthFeet
    )
  }

  // Pass count (for all players)
  const passCount = calculatePassCount(annotations)

  // Spike accuracy overall and per player
  const overallSpikeAccuracy = calculateSpikeAccuracy(annotations)
  const spikeAccuracyByPlayer: Record<string, SpikeAccuracyResult> = {}
  for (const playerId of playerIds) {
    spikeAccuracyByPlayer[playerId] = calculateSpikeAccuracy(annotations, playerId)
  }

  // Point outcomes
  const pointOutcomes = calculatePointOutcomes(annotations)

  return {
    lateralDistance,
    passCount,
    spikeAccuracy: {
      overall: overallSpikeAccuracy,
      byPlayer: spikeAccuracyByPlayer,
    },
    pointOutcomes,
  }
}
