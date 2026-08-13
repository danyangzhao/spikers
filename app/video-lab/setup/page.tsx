'use client'

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RoundnetSlotSeedsV1 } from '@/lib/tracking-v2/types'

type SlotDraft = {
  slotId: 'p1' | 'p2' | 'p3' | 'p4'
  color: string
  name: string
  point: [number, number] | null
}

const DEFAULT_SLOTS: SlotDraft[] = [
  { slotId: 'p1', color: '#2563EB', name: 'left', point: null },
  { slotId: 'p2', color: '#EC4899', name: 'far', point: null },
  { slotId: 'p3', color: '#0F766E', name: 'near', point: null },
  { slotId: 'p4', color: '#DC2626', name: 'right', point: null },
]

export default function VideoLabSetupPage() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoLabel, setVideoLabel] = useState<string>('No video loaded')
  const [selectedSlot, setSelectedSlot] = useState<'p1' | 'p2' | 'p3' | 'p4'>('p1')
  const [slots, setSlots] = useState<SlotDraft[]>(DEFAULT_SLOTS)
  const [seedFrame, setSeedFrame] = useState<number>(0)
  const [currentFrame, setCurrentFrame] = useState<number>(0)
  const [videoMeta, setVideoMeta] = useState<{ width: number; height: number; fps: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const allTagged = useMemo(() => slots.every((slot) => slot.point !== null), [slots])

  const drawOverlay = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !videoMeta) {
      return
    }

    const width = video.clientWidth
    const height = video.clientHeight
    if (width <= 0 || height <= 0) {
      return
    }

    const dpr = window.devicePixelRatio || 1
    const targetW = Math.floor(width * dpr)
    const targetH = Math.floor(height * dpr)
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const scaleX = width / videoMeta.width
    const scaleY = height / videoMeta.height

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    for (const slot of slots) {
      if (!slot.point) {
        continue
      }
      const x = slot.point[0] * scaleX
      const y = slot.point[1] * scaleY
      ctx.fillStyle = slot.color
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, Math.PI * 2)
      ctx.fill()

      const label = `${slot.slotId}: ${slot.name || 'unnamed'}`
      ctx.font = '600 13px ui-sans-serif, system-ui'
      const textWidth = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(0,0,0,0.75)'
      ctx.fillRect(x + 8, y - 20, textWidth + 10, 20)
      ctx.fillStyle = '#fff'
      ctx.fillText(label, x + 12, y - 6)
    }
  }, [slots, videoMeta])

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return
    }
    let rafId = 0
    const tick = () => {
      drawOverlay()
      if (!video.paused && !video.ended) {
        rafId = window.requestAnimationFrame(tick)
      }
    }

    const onPlay = () => {
      setIsPlaying(true)
      rafId = window.requestAnimationFrame(tick)
    }
    const onPause = () => {
      setIsPlaying(false)
      if (videoMeta) {
        setCurrentFrame(Math.round(video.currentTime * videoMeta.fps))
      }
      if (rafId) {
        window.cancelAnimationFrame(rafId)
      }
      drawOverlay()
    }
    const onTime = () => {
      if (videoMeta) {
        setCurrentFrame(Math.round(video.currentTime * videoMeta.fps))
      }
      drawOverlay()
    }
    const onLoaded = () => drawOverlay()

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('seeked', onTime)
    video.addEventListener('loadedmetadata', onLoaded)
    window.addEventListener('resize', onLoaded)

    drawOverlay()
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId)
      }
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('seeked', onTime)
      video.removeEventListener('loadedmetadata', onLoaded)
      window.removeEventListener('resize', onLoaded)
    }
  }, [drawOverlay, videoMeta, videoUrl])

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl)
      }
    }
  }, [videoUrl])

  const handleVideoLoad = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    const url = URL.createObjectURL(file)
    setVideoUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current)
      }
      return url
    })
    setVideoLabel(file.name)
    setError(null)
    setSlots(DEFAULT_SLOTS)
    setSeedFrame(0)
  }, [])

  const handleMetadata = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      return
    }
    const width = video.videoWidth
    const height = video.videoHeight
    const fpsGuess = 30
    setVideoMeta({ width, height, fps: fpsGuess })
    setCurrentFrame(0)
  }, [])

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!videoMeta || !videoRef.current || !canvasRef.current) {
        return
      }
      const rect = canvasRef.current.getBoundingClientRect()
      const xDisplay = event.clientX - rect.left
      const yDisplay = event.clientY - rect.top
      const x = (xDisplay / rect.width) * videoMeta.width
      const y = (yDisplay / rect.height) * videoMeta.height

      setSlots((current) =>
        current.map((slot) =>
          slot.slotId === selectedSlot ? { ...slot, point: [Math.round(x), Math.round(y)] } : slot,
        ),
      )

      const video = videoRef.current
      const frame = Math.round(video.currentTime * videoMeta.fps)
      setSeedFrame(frame)
      drawOverlay()
    },
    [drawOverlay, selectedSlot, videoMeta],
  )

  const handleExport = useCallback(() => {
    if (!videoMeta) {
      setError('Load a video first.')
      return
    }
    if (!allTagged) {
      setError('Tag all 4 slots before exporting.')
      return
    }
    const payload: RoundnetSlotSeedsV1 = {
      schemaVersion: 'roundnet-slot-seeds-v1',
      seedFrame,
      video: {
        width: videoMeta.width,
        height: videoMeta.height,
        fps: videoMeta.fps,
      },
      slots: slots.map((slot) => ({
        slotId: slot.slotId,
        name: slot.name || slot.slotId,
        headPointImage: slot.point as [number, number],
      })),
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'roundnet-slot-seeds.json'
    link.click()
    URL.revokeObjectURL(url)
    setError(null)
  }, [allTagged, seedFrame, slots, videoMeta])

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Roundnet Video Lab Setup (Tap-to-name)</h1>
        <p className="mt-2 text-sm text-gray-600">
          Required milestone flow: pause on frame zero (or a clean frame), tap each player’s head/hat,
          assign names, and export a 4-slot seed JSON for offline tracking.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Local video file</span>
          <input type="file" accept="video/*" onChange={handleVideoLoad} />
        </label>
        <p className="text-xs text-gray-600">Loaded: {videoLabel}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <div className="space-y-3">
          <div className="relative rounded-lg overflow-hidden bg-black">
            <video
              ref={videoRef}
              src={videoUrl ?? undefined}
              controls
              className="w-full h-auto"
              preload="metadata"
              onLoadedMetadata={handleMetadata}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full cursor-crosshair"
              onClick={handleCanvasClick}
            />
          </div>
          <p className="text-xs text-gray-600">
            Selected seed frame: {seedFrame} • Current frame: {videoMeta ? currentFrame : 0} •{' '}
            {isPlaying ? 'Playing' : 'Paused'}
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="font-semibold mb-3">Identity slots (fixed = 4)</h2>
            <div className="space-y-3">
              {slots.map((slot) => (
                <div key={slot.slotId} className="rounded border border-gray-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      className={`rounded px-2 py-1 text-xs font-semibold ${
                        selectedSlot === slot.slotId ? 'bg-black text-white' : 'bg-gray-100 text-gray-800'
                      }`}
                      onClick={() => setSelectedSlot(slot.slotId)}
                    >
                      select {slot.slotId}
                    </button>
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: slot.color }}
                    />
                  </div>
                  <input
                    className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    value={slot.name}
                    onChange={(event) =>
                      setSlots((current) =>
                        current.map((item) =>
                          item.slotId === slot.slotId ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <p className="mt-2 text-xs text-gray-600">
                    {slot.point
                      ? `Tagged at (${slot.point[0]}, ${slot.point[1]})`
                      : 'Not tagged yet — click this slot, then tap the player head in the frame.'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <button
            className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-gray-400"
            onClick={handleExport}
            disabled={!allTagged || !videoMeta}
          >
            Export slot seed JSON
          </button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      </div>
    </div>
  )
}
