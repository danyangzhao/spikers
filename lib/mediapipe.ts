/**
 * MediaPipe Pose Detection Helper
 *
 * This module provides browser-based pose detection using MediaPipe.
 * It can detect multiple people in a video frame and track their positions.
 *
 * Note: This runs entirely in the browser - no server-side processing needed!
 */

import {
  PoseLandmarker,
  FilesetResolver,
  PoseLandmarkerResult,
} from '@mediapipe/tasks-vision'

// Singleton instance of the pose landmarker
let poseLandmarker: PoseLandmarker | null = null
let isInitializing = false
let lastTimestamp = 0 // Track last timestamp to ensure monotonic increase
let isDetecting = false // Prevent concurrent detection calls

// Model URL - using the lite model for faster loading
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

/**
 * Initialize the MediaPipe Pose Landmarker
 * This only needs to be called once - subsequent calls will reuse the instance
 */
export async function initializePoseLandmarker(): Promise<PoseLandmarker> {
  if (poseLandmarker) {
    return poseLandmarker
  }

  if (isInitializing) {
    // Wait for initialization to complete
    while (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (poseLandmarker) {
      return poseLandmarker
    }
  }

  isInitializing = true

  try {
    // Load the vision WASM files
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    )

    // Create the pose landmarker
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU', // Use GPU for better performance
      },
      runningMode: 'VIDEO',
      numPoses: 4, // Detect up to 4 people (spikeball is 2v2)
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })

    return poseLandmarker
  } finally {
    isInitializing = false
  }
}

/**
 * Detected person with simplified position data
 */
export interface DetectedPerson {
  // Center position (average of key body points), normalized 0-1
  x: number
  y: number
  // Bounding box
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }
  // Confidence score
  confidence: number
  // Raw landmarks for advanced use
  landmarks: Array<{ x: number; y: number; z: number; visibility: number }>
}

/**
 * Process a video frame and detect people
 *
 * @param video - HTML video element to process
 * @param timestampMs - Current video timestamp in milliseconds
 * @returns Array of detected people with positions
 */
export async function detectPoses(
  video: HTMLVideoElement,
  timestampMs: number
): Promise<DetectedPerson[]> {
  // Prevent concurrent detection calls
  if (isDetecting) {
    console.log('Detection already in progress, skipping')
    return []
  }
  
  isDetecting = true
  
  try {
    const landmarker = await initializePoseLandmarker()

    // MediaPipe requires strictly increasing timestamps
    // Ensure timestamp is always greater than the last one
    let safeTimestamp = Math.floor(timestampMs)
    if (safeTimestamp <= lastTimestamp) {
      safeTimestamp = lastTimestamp + 1
    }
    lastTimestamp = safeTimestamp

    // Detect poses in the current frame
    const result: PoseLandmarkerResult = landmarker.detectForVideo(
      video,
      safeTimestamp
    )

    // Convert to simplified format
    return result.landmarks.map((landmarks) => {
      // Calculate center from hip landmarks (11 and 12 are left/right hip)
      const leftHip = landmarks[23]
      const rightHip = landmarks[24]

      // Use hip center as the person's position (more stable than other points)
      const centerX = (leftHip.x + rightHip.x) / 2
      const centerY = (leftHip.y + rightHip.y) / 2

      // Calculate bounding box from all landmarks
      const xs = landmarks.map((l) => l.x)
      const ys = landmarks.map((l) => l.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)

      // Average visibility as confidence
      const confidence =
        landmarks.reduce((sum, l) => sum + (l.visibility ?? 0), 0) /
        landmarks.length

      return {
        x: centerX,
        y: centerY,
        boundingBox: {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        },
        confidence,
        landmarks: landmarks.map((l) => ({
          x: l.x,
          y: l.y,
          z: l.z,
          visibility: l.visibility ?? 0,
        })),
      }
    })
  } finally {
    isDetecting = false
  }
}

/**
 * Find which detected person is closest to a given position
 * Used for tracking players between frames
 *
 * @param detectedPeople - Array of detected people from current frame
 * @param targetX - Target x position (normalized 0-1)
 * @param targetY - Target y position (normalized 0-1)
 * @param maxDistance - Maximum distance to consider a match (default 0.2)
 * @returns The closest person, or null if none within maxDistance
 */
export function findClosestPerson(
  detectedPeople: DetectedPerson[],
  targetX: number,
  targetY: number,
  maxDistance: number = 0.2
): DetectedPerson | null {
  let closest: DetectedPerson | null = null
  let minDistance = maxDistance

  for (const person of detectedPeople) {
    const dx = person.x - targetX
    const dy = person.y - targetY
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < minDistance) {
      minDistance = distance
      closest = person
    }
  }

  return closest
}

/**
 * Track multiple players across frames
 * Assigns each detected person to the closest known player
 *
 * @param detectedPeople - Array of detected people from current frame
 * @param lastKnownPositions - Map of playerId to last known position
 * @returns Map of playerId to current detected person (or null if lost)
 */
export function trackPlayers(
  detectedPeople: DetectedPerson[],
  lastKnownPositions: Map<string, { x: number; y: number }>
): Map<string, DetectedPerson | null> {
  const result = new Map<string, DetectedPerson | null>()
  const assignedPeople = new Set<DetectedPerson>()

  // For each known player, find the closest detected person
  for (const [playerId, lastPos] of lastKnownPositions) {
    const unassigned = detectedPeople.filter((p) => !assignedPeople.has(p))
    const closest = findClosestPerson(unassigned, lastPos.x, lastPos.y)

    if (closest) {
      result.set(playerId, closest)
      assignedPeople.add(closest)
    } else {
      result.set(playerId, null) // Player lost
    }
  }

  return result
}

/**
 * Clean up MediaPipe resources
 * Call this when you're done with pose detection
 */
export function cleanup(): void {
  if (poseLandmarker) {
    poseLandmarker.close()
    poseLandmarker = null
  }
  lastTimestamp = 0 // Reset timestamp tracker
}
