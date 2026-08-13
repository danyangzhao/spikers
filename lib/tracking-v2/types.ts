export interface Point2D {
  x: number
  y: number
}

export interface TrackingPlayerDefinition {
  id: string
  name: string
  color: string
}

export interface TrackingPlayerObservation {
  visible: boolean
  bbox: [number, number, number, number] | null
  footImage: [number, number] | null
  footWorld: [number, number] | null
  footConfidence: number
  sourceTrackId: number | null
  appearanceScore: number | null
}

export interface TrackingFrame {
  frame: number
  timeSec: number
  players: Record<string, TrackingPlayerObservation | null>
}

export interface TrackingCalibration {
  netDiameterFeet: number
  netPointsImage: [number, number][]
  netPointsWorld: [number, number][]
  homographyImageToWorld: number[][]
}

export interface TrackingDiagnostics {
  missingFramesByPlayer: Record<string, number>
  jumpWarnings: Array<{
    playerId: string
    frame: number
    jumpFeet: number
  }>
}

export interface RoundnetTrackingV2Result {
  schemaVersion: 'roundnet-tracking-v2'
  generatedAtIso: string
  sourceVideoPath: string
  video: {
    width: number
    height: number
    fps: number
    frameCount: number
    durationSec: number
  }
  calibration: TrackingCalibration | null
  players: TrackingPlayerDefinition[]
  frames: TrackingFrame[]
  distanceFeetByPlayer: Record<string, number | null>
  diagnostics: TrackingDiagnostics
}

export interface IdentitySwapCorrection {
  frame: number
  playerA: string
  playerB: string
}
