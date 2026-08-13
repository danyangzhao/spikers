import {
  calculateDistanceFromWorldSamples,
  computeHomographyFromFourPoints,
  projectPointWithHomography,
} from '@/lib/tracking-v2/geometry'

describe('tracking-v2 geometry', () => {
  it('computes a homography that maps image points onto known world points', () => {
    const image = [
      { x: 120, y: 80 },
      { x: 520, y: 130 },
      { x: 540, y: 420 },
      { x: 90, y: 360 },
    ]
    const world = [
      { x: -1.5, y: 1.5 },
      { x: 1.5, y: 1.5 },
      { x: 1.5, y: -1.5 },
      { x: -1.5, y: -1.5 },
    ]

    const homography = computeHomographyFromFourPoints(image, world)

    for (let i = 0; i < image.length; i += 1) {
      const projected = projectPointWithHomography(image[i], homography)
      expect(projected.x).toBeCloseTo(world[i].x, 4)
      expect(projected.y).toBeCloseTo(world[i].y, 4)
    }
  })

  it('keeps standing jitter near zero distance', () => {
    const samples = [
      { frame: 0, point: { x: 0, y: 0 }, confidence: 0.9 },
      { frame: 1, point: { x: 0.02, y: -0.01 }, confidence: 0.9 },
      { frame: 2, point: { x: -0.01, y: 0.01 }, confidence: 0.9 },
      { frame: 3, point: { x: 0.01, y: 0.02 }, confidence: 0.9 },
      { frame: 4, point: { x: 0, y: -0.02 }, confidence: 0.9 },
    ]

    const distance = calculateDistanceFromWorldSamples(samples, {
      fps: 30,
      minStepFeet: 0.08,
      smoothingAlpha: 1,
    })

    expect(distance).toBeLessThan(0.01)
  })

  it('captures true movement while rejecting impossible jumps', () => {
    const samples = [
      { frame: 0, point: { x: 0, y: 0 }, confidence: 0.95 },
      { frame: 15, point: { x: 5, y: 0 }, confidence: 0.95 },
      { frame: 30, point: { x: 10, y: 0 }, confidence: 0.95 },
      // 40 feet in one frame (1200 ft/s) should be rejected
      { frame: 31, point: { x: 50, y: 0 }, confidence: 0.95 },
    ]

    const distance = calculateDistanceFromWorldSamples(samples, {
      fps: 30,
      minStepFeet: 0.01,
      maxSpeedFeetPerSec: 25,
      smoothingAlpha: 1,
      maxGapFrames: 60,
    })

    expect(distance).toBeCloseTo(10, 4)
  })
})
