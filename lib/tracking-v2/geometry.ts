import { Point2D } from '@/lib/tracking-v2/types'

export interface DistanceComputationOptions {
  fps: number
  minConfidence?: number
  minStepFeet?: number
  maxSpeedFeetPerSec?: number
  smoothingAlpha?: number
  maxGapFrames?: number
}

export interface WorldSample {
  frame: number
  point: Point2D | null
  confidence: number
}

const DEFAULT_DISTANCE_OPTIONS = {
  minConfidence: 0.35,
  minStepFeet: 0.08,
  maxSpeedFeetPerSec: 25,
  smoothingAlpha: 0.3,
  maxGapFrames: 10,
}

export function euclideanDistance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function computeHomographyFromFourPoints(
  imagePoints: Point2D[],
  worldPoints: Point2D[],
): number[][] {
  if (imagePoints.length !== 4 || worldPoints.length !== 4) {
    throw new Error('Homography requires exactly four image points and four world points.')
  }

  const rows: number[][] = []
  const rhs: number[] = []

  for (let i = 0; i < 4; i += 1) {
    const { x, y } = imagePoints[i]
    const { x: u, y: v } = worldPoints[i]

    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    rhs.push(u)
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    rhs.push(v)
  }

  const h = solveLinearSystem(rows, rhs)

  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ]
}

export function projectPointWithHomography(point: Point2D, homography: number[][]): Point2D {
  if (homography.length !== 3 || homography.some((row) => row.length !== 3)) {
    throw new Error('Homography must be a 3x3 matrix.')
  }

  const x = point.x
  const y = point.y

  const denom = homography[2][0] * x + homography[2][1] * y + homography[2][2]
  if (Math.abs(denom) < 1e-9) {
    throw new Error('Homography projection denominator is too close to zero.')
  }

  return {
    x: (homography[0][0] * x + homography[0][1] * y + homography[0][2]) / denom,
    y: (homography[1][0] * x + homography[1][1] * y + homography[1][2]) / denom,
  }
}

export function calculateDistanceFromWorldSamples(
  samples: WorldSample[],
  options: DistanceComputationOptions,
): number {
  const minConfidence = options.minConfidence ?? DEFAULT_DISTANCE_OPTIONS.minConfidence
  const minStepFeet = options.minStepFeet ?? DEFAULT_DISTANCE_OPTIONS.minStepFeet
  const maxSpeedFeetPerSec =
    options.maxSpeedFeetPerSec ?? DEFAULT_DISTANCE_OPTIONS.maxSpeedFeetPerSec
  const smoothingAlpha = options.smoothingAlpha ?? DEFAULT_DISTANCE_OPTIONS.smoothingAlpha
  const maxGapFrames = options.maxGapFrames ?? DEFAULT_DISTANCE_OPTIONS.maxGapFrames
  const ordered = [...samples].sort((a, b) => a.frame - b.frame)

  let previousSmooth: Point2D | null = null
  let previousFrame: number | null = null
  let distance = 0

  for (const sample of ordered) {
    const isValid =
      sample.point !== null &&
      sample.confidence >= minConfidence &&
      Number.isFinite(sample.point.x) &&
      Number.isFinite(sample.point.y)

    if (!isValid) {
      previousSmooth = null
      previousFrame = null
      continue
    }

    const currentPoint = sample.point as Point2D

    if (previousSmooth === null || previousFrame === null) {
      previousSmooth = currentPoint
      previousFrame = sample.frame
      continue
    }

    const frameDelta = sample.frame - previousFrame
    if (frameDelta <= 0 || frameDelta > maxGapFrames) {
      previousSmooth = currentPoint
      previousFrame = sample.frame
      continue
    }

    const smoothedPoint: Point2D = {
      x: smoothingAlpha * currentPoint.x + (1 - smoothingAlpha) * previousSmooth.x,
      y: smoothingAlpha * currentPoint.y + (1 - smoothingAlpha) * previousSmooth.y,
    }

    const stepFeet = euclideanDistance(previousSmooth, smoothedPoint)
    const dtSeconds = frameDelta / options.fps
    const speedFeetPerSecond = stepFeet / dtSeconds

    if (stepFeet >= minStepFeet && speedFeetPerSecond <= maxSpeedFeetPerSec) {
      distance += stepFeet
    }

    previousSmooth = smoothedPoint
    previousFrame = sample.frame
  }

  return distance
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const n = vector.length
  const augmented = matrix.map((row, i) => [...row, vector[i]])

  for (let col = 0; col < n; col += 1) {
    let pivotRow = col
    let maxAbs = Math.abs(augmented[col][col])
    for (let r = col + 1; r < n; r += 1) {
      const candidate = Math.abs(augmented[r][col])
      if (candidate > maxAbs) {
        maxAbs = candidate
        pivotRow = r
      }
    }

    if (maxAbs < 1e-10) {
      throw new Error('Cannot solve homography system: matrix is singular.')
    }

    if (pivotRow !== col) {
      const temp = augmented[col]
      augmented[col] = augmented[pivotRow]
      augmented[pivotRow] = temp
    }

    const pivot = augmented[col][col]
    for (let c = col; c <= n; c += 1) {
      augmented[col][c] /= pivot
    }

    for (let r = 0; r < n; r += 1) {
      if (r === col) {
        continue
      }
      const factor = augmented[r][col]
      if (factor === 0) {
        continue
      }
      for (let c = col; c <= n; c += 1) {
        augmented[r][c] -= factor * augmented[col][c]
      }
    }
  }

  return augmented.map((row) => row[n])
}
