import {
  IdentitySwapCorrection,
  RoundnetTrackingV2Result,
  TrackingFrame,
  TrackingPlayerObservation,
} from '@/lib/tracking-v2/types'
import { calculateDistanceFromWorldSamples } from '@/lib/tracking-v2/geometry'

export function sortCorrections(
  corrections: IdentitySwapCorrection[],
): IdentitySwapCorrection[] {
  return [...corrections].sort((a, b) => a.frame - b.frame)
}

export function getSourcePlayerIdForDisplayPlayerAtFrame(
  displayPlayerId: string,
  frameNumber: number,
  playerIds: string[],
  corrections: IdentitySwapCorrection[],
): string {
  const mapping = new Map<string, string>()
  for (const playerId of playerIds) {
    mapping.set(playerId, playerId)
  }

  const ordered = sortCorrections(corrections)
  for (const correction of ordered) {
    if (correction.frame > frameNumber) {
      break
    }

    const currentA = mapping.get(correction.playerA)
    const currentB = mapping.get(correction.playerB)

    if (!currentA || !currentB) {
      continue
    }

    mapping.set(correction.playerA, currentB)
    mapping.set(correction.playerB, currentA)
  }

  return mapping.get(displayPlayerId) ?? displayPlayerId
}

export function getDisplayObservationAtFrame(
  frame: TrackingFrame,
  displayPlayerId: string,
  playerIds: string[],
  corrections: IdentitySwapCorrection[],
): TrackingPlayerObservation | null {
  const sourcePlayerId = getSourcePlayerIdForDisplayPlayerAtFrame(
    displayPlayerId,
    frame.frame,
    playerIds,
    corrections,
  )

  return frame.players[sourcePlayerId] ?? null
}

export function computeDistancesWithCorrections(
  result: RoundnetTrackingV2Result,
  corrections: IdentitySwapCorrection[],
): Record<string, number | null> {
  const playerIds = result.players.map((player) => player.id)
  const output: Record<string, number | null> = {}

  for (const displayPlayerId of playerIds) {
    const hasWorldCoordinates = result.frames.some((frame) => {
      const obs = getDisplayObservationAtFrame(frame, displayPlayerId, playerIds, corrections)
      return Boolean(obs?.footWorld)
    })

    if (!hasWorldCoordinates) {
      output[displayPlayerId] = null
      continue
    }

    const samples = result.frames.map((frame) => {
      const obs = getDisplayObservationAtFrame(frame, displayPlayerId, playerIds, corrections)
      if (!obs?.footWorld) {
        return { frame: frame.frame, point: null, confidence: 0 }
      }
      return {
        frame: frame.frame,
        point: { x: obs.footWorld[0], y: obs.footWorld[1] },
        confidence: obs.footConfidence,
      }
    })

    output[displayPlayerId] = calculateDistanceFromWorldSamples(samples, {
      fps: result.video.fps,
    })
  }

  return output
}

export function detectJumpWarnings(
  result: RoundnetTrackingV2Result,
  corrections: IdentitySwapCorrection[],
  jumpThresholdFeet: number,
): Array<{ playerId: string; frame: number; jumpFeet: number }> {
  const warnings: Array<{ playerId: string; frame: number; jumpFeet: number }> = []
  const playerIds = result.players.map((player) => player.id)

  for (const displayPlayerId of playerIds) {
    let prevPoint: [number, number] | null = null
    let prevFrame: number | null = null

    for (const frame of result.frames) {
      const obs = getDisplayObservationAtFrame(frame, displayPlayerId, playerIds, corrections)
      if (!obs?.footWorld || obs.footConfidence < 0.35) {
        prevPoint = null
        prevFrame = null
        continue
      }

      if (prevPoint && prevFrame !== null) {
        const frameGap = frame.frame - prevFrame
        if (frameGap > 0 && frameGap <= 4) {
          const jumpFeet = Math.hypot(obs.footWorld[0] - prevPoint[0], obs.footWorld[1] - prevPoint[1])
          if (jumpFeet >= jumpThresholdFeet) {
            warnings.push({
              playerId: displayPlayerId,
              frame: frame.frame,
              jumpFeet,
            })
          }
        }
      }

      prevPoint = obs.footWorld
      prevFrame = frame.frame
    }
  }

  return warnings
}
