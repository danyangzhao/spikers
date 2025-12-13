'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { detectPoses, DetectedPerson, cleanup } from '@/lib/mediapipe'

interface Player {
  id: string
  name: string
  emoji: string
}

interface TaggedPlayer {
  playerId: string
  player: Player
  color: string
  lastPosition: { x: number; y: number }
}

interface MediaPipeOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  isPlaying: boolean
  taggedPlayers: TaggedPlayer[]
  onPlayerPositionsUpdate?: (positions: Map<string, { x: number; y: number }>) => void
  onPersonClick?: (person: DetectedPerson, clickX: number, clickY: number) => void
  showSkeletons?: boolean
  trackingInterval?: number // ms between tracking updates
}

export default function MediaPipeOverlay({
  videoRef,
  isPlaying,
  taggedPlayers,
  onPlayerPositionsUpdate,
  onPersonClick,
  showSkeletons = true,
  trackingInterval = 200, // Track every 200ms by default
}: MediaPipeOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [detectedPeople, setDetectedPeople] = useState<DetectedPerson[]>([])
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Only enable click capture when onPersonClick is provided
  const enableClickCapture = !!onPersonClick
  const lastTrackTimeRef = useRef<number>(0)
  const animationFrameRef = useRef<number | null>(null)

  // Map player IDs to their current detected positions
  const playerPositionsRef = useRef<Map<string, { x: number; y: number }>>(
    new Map()
  )

  // Initialize player positions from tagged players
  useEffect(() => {
    for (const tp of taggedPlayers) {
      if (!playerPositionsRef.current.has(tp.playerId)) {
        playerPositionsRef.current.set(tp.playerId, tp.lastPosition)
      }
    }
  }, [taggedPlayers])

  // Main tracking loop
  const trackFrame = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || video.paused || video.ended) {
      return
    }

    const currentTime = video.currentTime * 1000 // Convert to ms

    // Only track at specified interval
    if (currentTime - lastTrackTimeRef.current < trackingInterval) {
      animationFrameRef.current = requestAnimationFrame(trackFrame)
      return
    }

    lastTrackTimeRef.current = currentTime

    try {
      const people = await detectPoses(video, currentTime)
      setIsInitialized(true)
      setDetectedPeople(people)

      // Update player positions based on proximity tracking
      if (taggedPlayers.length > 0 && people.length > 0) {
        const newPositions = new Map<string, { x: number; y: number }>()
        const assignedPeople = new Set<DetectedPerson>()

        // For each tagged player, find the closest detected person
        for (const tp of taggedPlayers) {
          const lastPos = playerPositionsRef.current.get(tp.playerId) || tp.lastPosition
          
          // Find closest unassigned person
          let closest: DetectedPerson | null = null
          let minDist = 0.3 // Max tracking distance

          for (const person of people) {
            if (assignedPeople.has(person)) continue
            
            const dx = person.x - lastPos.x
            const dy = person.y - lastPos.y
            const dist = Math.sqrt(dx * dx + dy * dy)

            if (dist < minDist) {
              minDist = dist
              closest = person
            }
          }

          if (closest) {
            newPositions.set(tp.playerId, { x: closest.x, y: closest.y })
            assignedPeople.add(closest)
          } else {
            // Keep last known position
            newPositions.set(tp.playerId, lastPos)
          }
        }

        playerPositionsRef.current = newPositions
        onPlayerPositionsUpdate?.(newPositions)
      }

      // Draw overlay
      drawOverlay(canvas, video, people)
    } catch (err) {
      console.error('MediaPipe error:', err)
      setError('Failed to detect poses')
    }

    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(trackFrame)
    }
  }, [videoRef, isPlaying, taggedPlayers, trackingInterval, onPlayerPositionsUpdate])

  // Run detection once when video is ready (even if paused)
  const detectOnce = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || video.readyState < 2) return // Need at least HAVE_CURRENT_DATA

    try {
      const currentTime = video.currentTime * 1000
      const people = await detectPoses(video, currentTime)
      setIsInitialized(true)
      setDetectedPeople(people)
      drawOverlay(canvas, video, people)
      console.log('Detected', people.length, 'people (single detection)')
    } catch (err) {
      console.error('MediaPipe detection error:', err)
    }
  }, [videoRef])

  // Start/stop tracking when playing state changes
  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(trackFrame)
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      // Run detection once when paused (so we can click on detected people)
      detectOnce()
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying, trackFrame, detectOnce])

  // Run detection when video becomes ready (loadeddata event)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleLoadedData = () => {
      console.log('Video loaded, running initial detection')
      detectOnce()
    }

    // If video is already ready, detect now
    if (video.readyState >= 2) {
      detectOnce()
    }

    video.addEventListener('loadeddata', handleLoadedData)
    video.addEventListener('seeked', detectOnce) // Also detect after seeking

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData)
      video.removeEventListener('seeked', detectOnce)
    }
  }, [videoRef, detectOnce])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  // Draw the overlay on canvas
  const drawOverlay = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    people: DetectedPerson[]
  ) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Match canvas size to video
    canvas.width = video.videoWidth || video.clientWidth
    canvas.height = video.videoHeight || video.clientHeight

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!showSkeletons) return

    // Draw each detected person
    for (const person of people) {
      // Check if this person is assigned to a tagged player
      let playerColor = 'rgba(255, 255, 255, 0.7)'
      let playerLabel = ''

      for (const tp of taggedPlayers) {
        const pos = playerPositionsRef.current.get(tp.playerId)
        if (pos) {
          const dx = person.x - pos.x
          const dy = person.y - pos.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 0.05) {
            playerColor = tp.color
            playerLabel = `${tp.player.emoji} ${tp.player.name}`
            break
          }
        }
      }

      // Draw bounding box
      const boxX = person.boundingBox.x * canvas.width
      const boxY = person.boundingBox.y * canvas.height
      const boxW = person.boundingBox.width * canvas.width
      const boxH = person.boundingBox.height * canvas.height

      ctx.strokeStyle = playerColor
      ctx.lineWidth = 2
      ctx.strokeRect(boxX, boxY, boxW, boxH)

      // Draw center point
      const centerX = person.x * canvas.width
      const centerY = person.y * canvas.height

      ctx.beginPath()
      ctx.arc(centerX, centerY, 8, 0, 2 * Math.PI)
      ctx.fillStyle = playerColor
      ctx.fill()

      // Draw label
      if (playerLabel) {
        ctx.font = '14px sans-serif'
        ctx.fillStyle = playerColor
        ctx.fillText(playerLabel, boxX, boxY - 5)
      }

      // Draw skeleton connections
      drawSkeleton(ctx, person.landmarks, canvas.width, canvas.height, playerColor)
    }
  }

  // Draw skeleton lines connecting body parts
  const drawSkeleton = (
    ctx: CanvasRenderingContext2D,
    landmarks: Array<{ x: number; y: number; visibility: number }>,
    width: number,
    height: number,
    color: string
  ) => {
    // Pose landmark connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 7], // Face
      [0, 4], [4, 5], [5, 6], [6, 8],
      [11, 12], // Shoulders
      [11, 13], [13, 15], // Left arm
      [12, 14], [14, 16], // Right arm
      [11, 23], [12, 24], // Torso
      [23, 24], // Hips
      [23, 25], [25, 27], // Left leg
      [24, 26], [26, 28], // Right leg
    ]

    ctx.strokeStyle = color
    ctx.lineWidth = 2

    for (const [i, j] of connections) {
      const p1 = landmarks[i]
      const p2 = landmarks[j]

      if (p1.visibility > 0.5 && p2.visibility > 0.5) {
        ctx.beginPath()
        ctx.moveTo(p1.x * width, p1.y * height)
        ctx.lineTo(p2.x * width, p2.y * height)
        ctx.stroke()
      }
    }
  }

  // Handle click on canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !onPersonClick) return

    const rect = canvasRef.current.getBoundingClientRect()
    const clickX = (e.clientX - rect.left) / rect.width
    const clickY = (e.clientY - rect.top) / rect.height

    console.log('Canvas click at:', clickX.toFixed(2), clickY.toFixed(2))
    console.log('Detected people:', detectedPeople.length)

    // Find if click is inside a detected person's bounding box
    for (const person of detectedPeople) {
      const box = person.boundingBox
      // Add some padding to make clicking easier
      const padding = 0.02
      const inBox = (
        clickX >= box.x - padding &&
        clickX <= box.x + box.width + padding &&
        clickY >= box.y - padding &&
        clickY <= box.y + box.height + padding
      )

      console.log('Person box:', box, 'Click in box:', inBox)

      if (inBox) {
        console.log('Clicked on person!')
        onPersonClick(person, clickX, clickY)
        return
      }
    }

    // Fallback: if no bounding box match, try distance to center (larger threshold)
    for (const person of detectedPeople) {
      const dx = person.x - clickX
      const dy = person.y - clickY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < 0.2) { // Increased threshold
        console.log('Clicked near person center!')
        onPersonClick(person, clickX, clickY)
        return
      }
    }

    console.log('Click did not match any person')
  }

  return (
    <div className="absolute inset-0 pointer-events-none">
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full ${
          enableClickCapture ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
        }`}
        onClick={enableClickCapture ? handleCanvasClick : undefined}
      />
      
      {isPlaying && !isInitialized && (
        <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded pointer-events-none">
          Loading MediaPipe...
        </div>
      )}

      {error && (
        <div className="absolute top-2 left-2 bg-red-500/70 text-white text-xs px-2 py-1 rounded pointer-events-none">
          {error}
        </div>
      )}

      {isInitialized && (
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded pointer-events-none">
          {detectedPeople.length} person(s) detected
        </div>
      )}
    </div>
  )
}
