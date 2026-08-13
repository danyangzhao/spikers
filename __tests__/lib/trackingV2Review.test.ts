import {
  computeDistancesWithCorrections,
  getSourcePlayerIdForDisplayPlayerAtFrame,
} from '@/lib/tracking-v2/review'
import { RoundnetTrackingV2Result } from '@/lib/tracking-v2/types'

describe('tracking-v2 review corrections', () => {
  const fixture: RoundnetTrackingV2Result = {
    schemaVersion: 'roundnet-tracking-v2',
    generatedAtIso: '2026-08-13T00:00:00.000Z',
    sourceVideoPath: '/tmp/example.mov',
    video: {
      width: 1920,
      height: 1080,
      fps: 30,
      frameCount: 3,
      durationSec: 0.1,
    },
    calibration: null,
    players: [
      { id: 'p1', name: 'one', color: '#111111' },
      { id: 'p2', name: 'two', color: '#222222' },
    ],
    frames: [
      {
        frame: 0,
        timeSec: 0,
        players: {
          p1: {
            visible: true,
            bbox: null,
            footImage: [0, 0],
            footWorld: [0, 0],
            footConfidence: 0.9,
            sourceTrackId: 1,
            appearanceScore: 0.9,
          },
          p2: {
            visible: true,
            bbox: null,
            footImage: [0, 0],
            footWorld: [10, 0],
            footConfidence: 0.9,
            sourceTrackId: 2,
            appearanceScore: 0.9,
          },
        },
      },
      {
        frame: 1,
        timeSec: 1 / 30,
        players: {
          p1: {
            visible: true,
            bbox: null,
            footImage: [0, 0],
            footWorld: [1, 0],
            footConfidence: 0.9,
            sourceTrackId: 1,
            appearanceScore: 0.9,
          },
          p2: {
            visible: true,
            bbox: null,
            footImage: [0, 0],
            footWorld: [11, 0],
            footConfidence: 0.9,
            sourceTrackId: 2,
            appearanceScore: 0.9,
          },
        },
      },
      {
        frame: 2,
        timeSec: 2 / 30,
        players: {
          p1: {
            visible: true,
            bbox: null,
            footImage: [0, 0],
            footWorld: [2, 0],
            footConfidence: 0.9,
            sourceTrackId: 1,
            appearanceScore: 0.9,
          },
          p2: {
            visible: true,
            bbox: null,
            footImage: [0, 0],
            footWorld: [12, 0],
            footConfidence: 0.9,
            sourceTrackId: 2,
            appearanceScore: 0.9,
          },
        },
      },
    ],
    distanceFeetByPlayer: { p1: 2, p2: 2 },
    diagnostics: {
      missingFramesByPlayer: { p1: 0, p2: 0 },
      jumpWarnings: [],
    },
  }

  it('resolves source IDs at any frame with swap corrections', () => {
    const sourceBefore = getSourcePlayerIdForDisplayPlayerAtFrame('p1', 0, ['p1', 'p2'], [
      { frame: 1, playerA: 'p1', playerB: 'p2' },
    ])
    const sourceAfter = getSourcePlayerIdForDisplayPlayerAtFrame('p1', 2, ['p1', 'p2'], [
      { frame: 1, playerA: 'p1', playerB: 'p2' },
    ])

    expect(sourceBefore).toBe('p1')
    expect(sourceAfter).toBe('p2')
  })

  it('recomputes distances with swaps from a given frame onward', () => {
    const baselineDistances = computeDistancesWithCorrections(fixture, [])
    const swappedDistances = computeDistancesWithCorrections(fixture, [
      { frame: 1, playerA: 'p1', playerB: 'p2' },
    ])

    expect((baselineDistances.p1 ?? 0)).toBeGreaterThan(0)
    expect((baselineDistances.p2 ?? 0)).toBeGreaterThan(0)
    expect(swappedDistances.p1).not.toBeCloseTo(baselineDistances.p1 ?? 0, 5)
    expect(swappedDistances.p2).not.toBeCloseTo(baselineDistances.p2 ?? 0, 5)
  })
})
