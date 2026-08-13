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
  state?: 'visible' | 'occluded' | 'missing'
  bbox: [number, number, number, number] | null
  footImage: [number, number] | null
  predictedFootImage?: [number, number] | null
  footWorld: [number, number] | null
  footConfidence: number
  sourceTrackId: number | null
  appearanceScore: number | null
  occludedBy?: string | null
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
  slotSeedFrame?: number | null
  slotCount?: number
  slotSeedsRequired?: boolean
  innerTrackerUniqueIdCount?: number
  innerTrackerUniqueIds?: number[]
  rawPersonDetectionsPerFrameHistogram?: Record<string, number>
  slotTrackIdsByPlayer?: Record<string, number[]>
  slotTrackSwitchCountByPlayer?: Record<string, number>
  slotTrackSwitchEvents?: Array<{
    playerId: string
    frame: number
    fromTrackId: number
    toTrackId: number
  }>
  missingFramesByPlayer: Record<string, number>
  occludedFramesByPlayer?: Record<string, number>
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

export interface SlotSeed {
  slotId: 'p1' | 'p2' | 'p3' | 'p4'
  name: string
  headPointImage: [number, number]
}

export interface RoundnetSlotSeedsV1 {
  schemaVersion: 'roundnet-slot-seeds-v1'
  seedFrame: number
  video: {
    width: number
    height: number
    fps: number
  }
  slots: SlotSeed[]
}
