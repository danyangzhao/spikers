'use client'

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IdentitySwapCorrection,
  RoundnetTrackingV2Result,
  TrackingPlayerObservation,
} from '@/lib/tracking-v2/types'
import { computeDistancesWithCorrections, detectJumpWarnings } from '@/lib/tracking-v2/review'

type MappingByFrame = Array<Record<string, string>>

function formatFeet(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A'
  }
  return `${value.toFixed(2)} ft`
}

function buildMappingByFrame(
  frameCount: number,
  playerIds: string[],
  corrections: IdentitySwapCorrection[],
): MappingByFrame {
  const sorted = [...corrections].sort((a, b) => a.frame - b.frame)
  const mapping: Record<string, string> = {}
  for (const playerId of playerIds) {
    mapping[playerId] = playerId
  }

  const output: MappingByFrame = new Array(frameCount)
  let correctionIndex = 0
  for (let frame = 0; frame < frameCount; frame += 1) {
    while (correctionIndex < sorted.length && sorted[correctionIndex].frame <= frame) {
      const correction = sorted[correctionIndex]
      if (mapping[correction.playerA] && mapping[correction.playerB]) {
        const temp = mapping[correction.playerA]
        mapping[correction.playerA] = mapping[correction.playerB]
        mapping[correction.playerB] = temp
      }
      correctionIndex += 1
    }
    output[frame] = { ...mapping }
  }
  return output
}

function getObservation(
  result: RoundnetTrackingV2Result,
  mappingByFrame: MappingByFrame,
  frameIndex: number,
  displayPlayerId: string,
): TrackingPlayerObservation | null {
  const frame = result.frames[frameIndex]
  if (!frame) {
    return null
  }
  const sourceId = mappingByFrame[frameIndex]?.[displayPlayerId] ?? displayPlayerId
  return frame.players[sourceId] ?? null
}

export default function VideoLabReviewPage() {
  const [result, setResult] = useState<RoundnetTrackingV2Result | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [jsonFilename, setJsonFilename] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [currentFrame, setCurrentFrame] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [corrections, setCorrections] = useState<IdentitySwapCorrection[]>([])
  const [swapA, setSwapA] = useState<string>('')
  const [swapB, setSwapB] = useState<string>('')
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({})

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const playerIds = useMemo(() => result?.players.map((player) => player.id) ?? [], [result])

  const mappingByFrame = useMemo(() => {
    if (!result) {
      return []
    }
    return buildMappingByFrame(result.frames.length, playerIds, corrections)
  }, [result, playerIds, corrections])

  const distanceByPlayer = useMemo(() => {
    if (!result) {
      return {}
    }
    return computeDistancesWithCorrections(result, corrections)
  }, [result, corrections])

  const jumpWarnings = useMemo(() => {
    if (!result) {
      return []
    }
    return detectJumpWarnings(result, corrections, 6).slice(0, 100)
  }, [result, corrections])

  const currentStatusByPlayer = useMemo(() => {
    if (!result || currentFrame < 0 || currentFrame >= result.frames.length) {
      return {}
    }
    const status: Record<string, string> = {}
    for (const player of result.players) {
      const obs = getObservation(result, mappingByFrame, currentFrame, player.id)
      status[player.id] = obs?.state ?? (obs?.visible ? 'visible' : 'missing')
    }
    return status
  }, [currentFrame, mappingByFrame, result])

  const handleLoadJson = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as RoundnetTrackingV2Result
      if (parsed.schemaVersion !== 'roundnet-tracking-v2') {
        throw new Error(`Unexpected schemaVersion "${(parsed as { schemaVersion?: string }).schemaVersion ?? 'unknown'}"`)
      }
      if (!Array.isArray(parsed.players) || parsed.players.length !== 4) {
        throw new Error('Expected exactly 4 players in processed tracking JSON.')
      }
      if (!Array.isArray(parsed.frames) || parsed.frames.length === 0) {
        throw new Error('Tracking JSON has no frames.')
      }

      setResult(parsed)
      setJsonFilename(file.name)
      setLoadError(null)
      setCorrections([])
      setCurrentFrame(0)

      const nextNames: Record<string, string> = {}
      for (const player of parsed.players) {
        nextNames[player.id] = player.name
      }
      setNameOverrides(nextNames)
      setSwapA(parsed.players[0].id)
      setSwapB(parsed.players[1].id)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to parse JSON file.')
      setResult(null)
    }
  }, [])

  const handleLoadVideo = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    const objectUrl = URL.createObjectURL(file)
    setVideoUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current)
      }
      return objectUrl
    })
  }, [])

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl)
      }
    }
  }, [videoUrl])

  const drawOverlay = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !result) {
      return
    }

    const displayWidth = video.clientWidth
    const displayHeight = video.clientHeight
    if (displayWidth <= 0 || displayHeight <= 0) {
      return
    }

    const dpr = window.devicePixelRatio || 1
    const targetWidth = Math.floor(displayWidth * dpr)
    const targetHeight = Math.floor(displayHeight * dpr)
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth
      canvas.height = targetHeight
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, displayWidth, displayHeight)

    const frameIndex = Math.max(
      0,
      Math.min(result.frames.length - 1, Math.round(video.currentTime * result.video.fps)),
    )
    setCurrentFrame(frameIndex)

    const scaleX = displayWidth / result.video.width
    const scaleY = displayHeight / result.video.height
    const historyFrames = Math.round(result.video.fps * 4)

    for (const player of result.players) {
      const color = player.color
      const displayName = nameOverrides[player.id] ?? player.name

      // Trail path for the last few seconds.
      ctx.lineWidth = 3
      ctx.strokeStyle = color
      ctx.beginPath()
      let hasStartedPath = false
      let previousVisible = false

      for (let f = Math.max(0, frameIndex - historyFrames); f <= frameIndex; f += 1) {
        const obs = getObservation(result, mappingByFrame, f, player.id)
        if (!obs?.visible || !obs.footImage) {
          previousVisible = false
          continue
        }
        const x = obs.footImage[0] * scaleX
        const y = obs.footImage[1] * scaleY
        if (!hasStartedPath || !previousVisible) {
          ctx.moveTo(x, y)
          hasStartedPath = true
        } else {
          ctx.lineTo(x, y)
        }
        previousVisible = true
      }
      if (hasStartedPath) {
        ctx.stroke()
      }

      // Current point and label.
      const currentObs = getObservation(result, mappingByFrame, frameIndex, player.id)
      if (currentObs?.visible && currentObs.footImage) {
        const x = currentObs.footImage[0] * scaleX
        const y = currentObs.footImage[1] * scaleY
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, 7, 0, Math.PI * 2)
        ctx.fill()

        const label = `${displayName} (${player.id})`
        ctx.font = '600 14px ui-sans-serif, system-ui'
        const textWidth = ctx.measureText(label).width
        const labelX = Math.max(8, Math.min(displayWidth - textWidth - 18, x + 10))
        const labelY = Math.max(22, y - 10)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.fillRect(labelX - 6, labelY - 16, textWidth + 12, 22)
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(label, labelX, labelY)
      }
    }

    if (result.calibration?.netPointsImage?.length === 4) {
      ctx.strokeStyle = '#EAB308'
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i < result.calibration.netPointsImage.length; i += 1) {
        const point = result.calibration.netPointsImage[i]
        const x = point[0] * scaleX
        const y = point[1] * scaleY
        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.closePath()
      ctx.stroke()
    }
  }, [mappingByFrame, nameOverrides, result])

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    let rafId = 0
    const drawTick = () => {
      drawOverlay()
      if (!video.paused && !video.ended) {
        rafId = window.requestAnimationFrame(drawTick)
      }
    }

    const onPlay = () => {
      setIsPlaying(true)
      rafId = window.requestAnimationFrame(drawTick)
    }
    const onPause = () => {
      setIsPlaying(false)
      if (rafId) {
        window.cancelAnimationFrame(rafId)
      }
      drawOverlay()
    }
    const onTimeUpdate = () => drawOverlay()
    const onLoadedMetadata = () => drawOverlay()
    const onSeeked = () => drawOverlay()

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('seeked', onSeeked)
    window.addEventListener('resize', onLoadedMetadata)

    drawOverlay()

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId)
      }
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('seeked', onSeeked)
      window.removeEventListener('resize', onLoadedMetadata)
    }
  }, [drawOverlay, result, videoUrl])

  const handleAddSwap = useCallback(() => {
    if (!result || !swapA || !swapB || swapA === swapB) {
      return
    }
    setCorrections((current) =>
      [...current, { frame: currentFrame, playerA: swapA, playerB: swapB }].sort(
        (a, b) => a.frame - b.frame,
      ),
    )
  }, [currentFrame, result, swapA, swapB])

  const handleRemoveCorrection = useCallback((index: number) => {
    setCorrections((current) => current.filter((_, idx) => idx !== index))
  }, [])

  const handleExportCorrected = useCallback(() => {
    if (!result) {
      return
    }

    const payload: Record<string, unknown> = {
      ...result,
      players: result.players.map((player) => ({
        ...player,
        name: nameOverrides[player.id] ?? player.name,
      })),
      distanceFeetByPlayer: distanceByPlayer,
      reviewCorrections: [...corrections].sort((a, b) => a.frame - b.frame),
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = jsonFilename
      ? jsonFilename.replace(/\.json$/i, '.corrected.json')
      : 'roundnet-tracking.corrected.json'
    link.click()
    URL.revokeObjectURL(url)
  }, [corrections, distanceByPlayer, jsonFilename, nameOverrides, result])

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Roundnet Video Lab (Tracking v2)</h1>
        <p className="text-sm text-gray-600 mt-2">
          Load a processed tracking JSON and a local video file, then review persistent identities and
          ground-plane distance in feet.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Processed JSON</span>
            <input type="file" accept=".json,application/json" onChange={handleLoadJson} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Local Video File (MOV/MP4)</span>
            <input type="file" accept="video/*" onChange={handleLoadVideo} />
          </label>
        </div>
        {loadError && <p className="text-sm text-red-700">{loadError}</p>}
        {result && (
          <p className="text-xs text-gray-600">
            Loaded {jsonFilename || 'tracking JSON'} • {result.video.frameCount} frames @{' '}
            {result.video.fps.toFixed(2)} fps • fixed identity slots: {result.players.length}
          </p>
        )}
      </div>

      {result && (
        <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden bg-black">
              <video
                ref={videoRef}
                src={videoUrl ?? undefined}
                controls
                className="w-full h-auto"
                preload="metadata"
              />
              <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>
            {!videoUrl && (
              <p className="text-sm text-amber-700">
                Load a local video file to render the track overlay.
              </p>
            )}
            <p className="text-xs text-gray-600">
              Frame {currentFrame} / {Math.max(0, result.frames.length - 1)} •{' '}
              {isPlaying ? 'Playing' : 'Paused'}
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="font-semibold mb-3">Players and Distance</h2>
              <div className="space-y-3">
                {result.players.map((player) => (
                  <div key={player.id} className="rounded border border-gray-100 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: player.color }}
                      />
                      <span className="text-xs text-gray-500">{player.id}</span>
                    </div>
                    <input
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      value={nameOverrides[player.id] ?? player.name}
                      onChange={(event) =>
                        setNameOverrides((current) => ({
                          ...current,
                          [player.id]: event.target.value,
                        }))
                      }
                    />
                    <p className="mt-2 text-sm font-medium">
                      {formatFeet(distanceByPlayer[player.id] ?? null)}
                    </p>
                    <p className="mt-1 text-xs text-gray-600">state: {currentStatusByPlayer[player.id] ?? 'unknown'}</p>
                  </div>
                ))}
              </div>
              {!result.calibration && (
                <p className="mt-3 text-xs text-amber-700">
                  This JSON has no net calibration. Distances stay N/A until you process with net points.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="font-semibold mb-2">ID Correction (swap labels from current frame)</h2>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                <select
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                  value={swapA}
                  onChange={(event) => setSwapA(event.target.value)}
                >
                  {result.players.map((player) => (
                    <option key={`a-${player.id}`} value={player.id}>
                      {nameOverrides[player.id] ?? player.name} ({player.id})
                    </option>
                  ))}
                </select>
                <span className="text-xs text-gray-500">↔</span>
                <select
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                  value={swapB}
                  onChange={(event) => setSwapB(event.target.value)}
                >
                  {result.players.map((player) => (
                    <option key={`b-${player.id}`} value={player.id}>
                      {nameOverrides[player.id] ?? player.name} ({player.id})
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="mt-3 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:bg-gray-400"
                onClick={handleAddSwap}
                disabled={!swapA || !swapB || swapA === swapB}
              >
                Swap from frame {currentFrame}
              </button>

              {corrections.length > 0 ? (
                <ul className="mt-3 space-y-2 text-xs">
                  {corrections.map((correction, index) => (
                    <li key={`${correction.frame}-${correction.playerA}-${correction.playerB}-${index}`}>
                      <div className="flex items-center justify-between rounded border border-gray-200 p-2">
                        <span>
                          frame {correction.frame}: {correction.playerA} ↔ {correction.playerB}
                        </span>
                        <button
                          className="text-red-700 hover:underline"
                          onClick={() => handleRemoveCorrection(index)}
                        >
                          remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-gray-500">No corrections yet.</p>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="font-semibold mb-2">Diagnostics</h2>
              <p className="text-sm">
                Jump warnings (large short-gap teleports): <strong>{jumpWarnings.length}</strong>
              </p>
              <div className="mt-2 max-h-36 overflow-auto text-xs text-gray-700 space-y-1">
                {jumpWarnings.length === 0 && <p>No obvious ID jump warnings.</p>}
                {jumpWarnings.map((warning, index) => (
                  <p key={`${warning.playerId}-${warning.frame}-${index}`}>
                    frame {warning.frame}: {warning.playerId} jumped {warning.jumpFeet.toFixed(2)} ft
                  </p>
                ))}
              </div>
            </div>

            <button
              className="w-full rounded bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
              onClick={handleExportCorrected}
            >
              Export corrected JSON
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
