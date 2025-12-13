/**
 * Tests for video metrics calculations
 */

import {
  calculateLateralDistance,
  calculatePassCount,
  calculateSpikeAccuracy,
  calculatePointOutcomes,
  calculateGameMetrics,
} from '../../lib/videoMetrics'

// Mock annotation type
type MockAnnotation = {
  id: string
  frameTime: number
  type: 'PLAYER_POSITION' | 'PASS' | 'SPIKE' | 'POINT_WON' | 'POINT_LOST'
  playerId: string | null
  x: number | null
  y: number | null
  successful: boolean | null
  reason: 'SERVE_ACE' | 'GREAT_SPIKE' | 'OPPONENT_ERROR' | 'FAILED_RETURN' | 'NET_VIOLATION' | 'OUT_OF_BOUNDS' | 'OTHER' | null
}

describe('calculateLateralDistance', () => {
  it('returns zero for no annotations', () => {
    const result = calculateLateralDistance([], 'player1')
    expect(result.distanceFeet).toBe(0)
    expect(result.distanceMiles).toBe(0)
  })

  it('returns zero for single position', () => {
    const annotations: MockAnnotation[] = [
      { id: '1', frameTime: 0, type: 'PLAYER_POSITION', playerId: 'player1', x: 0.5, y: 0.5, successful: null, reason: null },
    ]
    const result = calculateLateralDistance(annotations, 'player1')
    expect(result.distanceFeet).toBe(0)
    expect(result.positionCount).toBe(1)
  })

  it('calculates horizontal distance correctly', () => {
    const annotations: MockAnnotation[] = [
      { id: '1', frameTime: 0, type: 'PLAYER_POSITION', playerId: 'player1', x: 0, y: 0.5, successful: null, reason: null },
      { id: '2', frameTime: 1, type: 'PLAYER_POSITION', playerId: 'player1', x: 0.5, y: 0.5, successful: null, reason: null },
      { id: '3', frameTime: 2, type: 'PLAYER_POSITION', playerId: 'player1', x: 1, y: 0.5, successful: null, reason: null },
    ]
    // Total normalized distance = 0.5 + 0.5 = 1.0
    // With field width 20ft: 1.0 * 20 = 20 feet
    const result = calculateLateralDistance(annotations, 'player1', 20)
    expect(result.distanceFeet).toBe(20)
    expect(result.positionCount).toBe(3)
  })

  it('only counts specified player', () => {
    const annotations: MockAnnotation[] = [
      { id: '1', frameTime: 0, type: 'PLAYER_POSITION', playerId: 'player1', x: 0, y: 0.5, successful: null, reason: null },
      { id: '2', frameTime: 1, type: 'PLAYER_POSITION', playerId: 'player2', x: 0.5, y: 0.5, successful: null, reason: null },
      { id: '3', frameTime: 2, type: 'PLAYER_POSITION', playerId: 'player1', x: 0.5, y: 0.5, successful: null, reason: null },
    ]
    const result = calculateLateralDistance(annotations, 'player1', 20)
    expect(result.distanceFeet).toBe(10) // 0.5 * 20
    expect(result.positionCount).toBe(2)
  })
})

describe('calculatePassCount', () => {
  it('returns zero for no annotations', () => {
    const result = calculatePassCount([])
    expect(result.totalPasses).toBe(0)
    expect(result.totalRallies).toBe(0)
    expect(result.avgPassesPerRally).toBe(0)
  })

  it('counts passes correctly', () => {
    const annotations: MockAnnotation[] = [
      { id: '1', frameTime: 0, type: 'PASS', playerId: 'player1', x: null, y: null, successful: null, reason: null },
      { id: '2', frameTime: 1, type: 'PASS', playerId: 'player2', x: null, y: null, successful: null, reason: null },
      { id: '3', frameTime: 2, type: 'POINT_WON', playerId: null, x: null, y: null, successful: null, reason: 'GREAT_SPIKE' },
    ]
    const result = calculatePassCount(annotations)
    expect(result.totalPasses).toBe(2)
    expect(result.totalRallies).toBe(1)
    expect(result.avgPassesPerRally).toBe(2)
  })

  it('calculates average across multiple rallies', () => {
    const annotations: MockAnnotation[] = [
      // Rally 1: 2 passes
      { id: '1', frameTime: 0, type: 'PASS', playerId: 'player1', x: null, y: null, successful: null, reason: null },
      { id: '2', frameTime: 1, type: 'PASS', playerId: 'player2', x: null, y: null, successful: null, reason: null },
      { id: '3', frameTime: 2, type: 'POINT_WON', playerId: null, x: null, y: null, successful: null, reason: 'GREAT_SPIKE' },
      // Rally 2: 4 passes
      { id: '4', frameTime: 3, type: 'PASS', playerId: 'player1', x: null, y: null, successful: null, reason: null },
      { id: '5', frameTime: 4, type: 'PASS', playerId: 'player2', x: null, y: null, successful: null, reason: null },
      { id: '6', frameTime: 5, type: 'PASS', playerId: 'player1', x: null, y: null, successful: null, reason: null },
      { id: '7', frameTime: 6, type: 'PASS', playerId: 'player2', x: null, y: null, successful: null, reason: null },
      { id: '8', frameTime: 7, type: 'POINT_LOST', playerId: null, x: null, y: null, successful: null, reason: 'OPPONENT_ERROR' },
    ]
    const result = calculatePassCount(annotations)
    expect(result.totalPasses).toBe(6)
    expect(result.totalRallies).toBe(2)
    expect(result.avgPassesPerRally).toBe(3)
  })
})

describe('calculateSpikeAccuracy', () => {
  it('returns zero for no spikes', () => {
    const result = calculateSpikeAccuracy([])
    expect(result.total).toBe(0)
    expect(result.percentage).toBe(0)
  })

  it('calculates accuracy correctly', () => {
    const annotations: MockAnnotation[] = [
      { id: '1', frameTime: 0, type: 'SPIKE', playerId: 'player1', x: null, y: null, successful: true, reason: null },
      { id: '2', frameTime: 1, type: 'SPIKE', playerId: 'player1', x: null, y: null, successful: true, reason: null },
      { id: '3', frameTime: 2, type: 'SPIKE', playerId: 'player1', x: null, y: null, successful: false, reason: null },
      { id: '4', frameTime: 3, type: 'SPIKE', playerId: 'player1', x: null, y: null, successful: true, reason: null },
    ]
    const result = calculateSpikeAccuracy(annotations, 'player1')
    expect(result.successful).toBe(3)
    expect(result.total).toBe(4)
    expect(result.percentage).toBe(75)
  })

  it('filters by player when specified', () => {
    const annotations: MockAnnotation[] = [
      { id: '1', frameTime: 0, type: 'SPIKE', playerId: 'player1', x: null, y: null, successful: true, reason: null },
      { id: '2', frameTime: 1, type: 'SPIKE', playerId: 'player2', x: null, y: null, successful: false, reason: null },
      { id: '3', frameTime: 2, type: 'SPIKE', playerId: 'player1', x: null, y: null, successful: true, reason: null },
    ]
    const result = calculateSpikeAccuracy(annotations, 'player1')
    expect(result.successful).toBe(2)
    expect(result.total).toBe(2)
    expect(result.percentage).toBe(100)
  })
})

describe('calculatePointOutcomes', () => {
  it('returns zeros for no points', () => {
    const result = calculatePointOutcomes([])
    expect(result.total).toBe(0)
    expect(result.totalWon).toBe(0)
    expect(result.totalLost).toBe(0)
  })

  it('counts points by reason', () => {
    const annotations: MockAnnotation[] = [
      { id: '1', frameTime: 0, type: 'POINT_WON', playerId: null, x: null, y: null, successful: null, reason: 'SERVE_ACE' },
      { id: '2', frameTime: 1, type: 'POINT_WON', playerId: null, x: null, y: null, successful: null, reason: 'GREAT_SPIKE' },
      { id: '3', frameTime: 2, type: 'POINT_LOST', playerId: null, x: null, y: null, successful: null, reason: 'OPPONENT_ERROR' },
      { id: '4', frameTime: 3, type: 'POINT_WON', playerId: null, x: null, y: null, successful: null, reason: 'SERVE_ACE' },
    ]
    const result = calculatePointOutcomes(annotations)
    expect(result.totalWon).toBe(3)
    expect(result.totalLost).toBe(1)
    expect(result.total).toBe(4)
    expect(result.winPercentage).toBe(75)
    expect(result.won['SERVE_ACE']).toBe(2)
    expect(result.won['GREAT_SPIKE']).toBe(1)
    expect(result.lost['OPPONENT_ERROR']).toBe(1)
  })
})

describe('calculateGameMetrics', () => {
  it('calculates all metrics for a game', () => {
    const annotations: MockAnnotation[] = [
      // Player positions
      { id: '1', frameTime: 0, type: 'PLAYER_POSITION', playerId: 'p1', x: 0, y: 0.5, successful: null, reason: null },
      { id: '2', frameTime: 1, type: 'PLAYER_POSITION', playerId: 'p1', x: 0.5, y: 0.5, successful: null, reason: null },
      { id: '3', frameTime: 2, type: 'PLAYER_POSITION', playerId: 'p2', x: 0.3, y: 0.5, successful: null, reason: null },
      { id: '4', frameTime: 3, type: 'PLAYER_POSITION', playerId: 'p2', x: 0.7, y: 0.5, successful: null, reason: null },
      // Passes
      { id: '5', frameTime: 4, type: 'PASS', playerId: 'p1', x: null, y: null, successful: null, reason: null },
      { id: '6', frameTime: 5, type: 'PASS', playerId: 'p2', x: null, y: null, successful: null, reason: null },
      // Spikes
      { id: '7', frameTime: 6, type: 'SPIKE', playerId: 'p1', x: null, y: null, successful: true, reason: null },
      // Point
      { id: '8', frameTime: 7, type: 'POINT_WON', playerId: null, x: null, y: null, successful: null, reason: 'GREAT_SPIKE' },
    ]

    const result = calculateGameMetrics(annotations, ['p1', 'p2'], 20)

    // Check lateral distance
    expect(result.lateralDistance['p1'].distanceFeet).toBe(10) // 0.5 * 20
    expect(result.lateralDistance['p2'].distanceFeet).toBe(8)  // 0.4 * 20

    // Check pass count
    expect(result.passCount.totalPasses).toBe(2)
    expect(result.passCount.totalRallies).toBe(1)

    // Check spike accuracy
    expect(result.spikeAccuracy.overall.total).toBe(1)
    expect(result.spikeAccuracy.overall.successful).toBe(1)
    expect(result.spikeAccuracy.byPlayer['p1'].total).toBe(1)

    // Check point outcomes
    expect(result.pointOutcomes.totalWon).toBe(1)
    expect(result.pointOutcomes.totalLost).toBe(0)
  })
})
