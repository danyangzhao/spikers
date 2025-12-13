'use client'

import { useState, useRef, useEffect } from 'react'

interface VideoTrimmerProps {
  videoUrl: string
  duration: number
  initialStartTime?: number
  initialEndTime?: number
  onSave: (startTime: number, endTime: number) => Promise<void>
  onCancel?: () => void
}

export default function VideoTrimmer({
  videoUrl,
  duration,
  initialStartTime = 0,
  initialEndTime,
  onSave,
  onCancel,
}: VideoTrimmerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [startTime, setStartTime] = useState(initialStartTime)
  const [endTime, setEndTime] = useState(initialEndTime ?? duration)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [saving, setSaving] = useState(false)

  // Update endTime when duration becomes available
  useEffect(() => {
    if (duration > 0 && endTime === 0) {
      setEndTime(duration)
    }
  }, [duration, endTime])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 10)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`
  }

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime
      setCurrentTime(time)

      // Stop at end trim point during playback
      if (time >= endTime) {
        videoRef.current.pause()
        videoRef.current.currentTime = startTime
        setIsPlaying(false)
      }
    }
  }

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        // Start from trim start if at the beginning or past end
        if (currentTime < startTime || currentTime >= endTime) {
          videoRef.current.currentTime = startTime
        }
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = parseFloat(e.target.value)
    if (newStart < endTime - 1) {
      setStartTime(newStart)
      if (currentTime < newStart) {
        handleSeek(newStart)
      }
    }
  }

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEnd = parseFloat(e.target.value)
    if (newEnd > startTime + 1) {
      setEndTime(newEnd)
      if (currentTime > newEnd) {
        handleSeek(newEnd)
      }
    }
  }

  const handleSetStart = () => {
    if (currentTime < endTime - 1) {
      setStartTime(currentTime)
    }
  }

  const handleSetEnd = () => {
    if (currentTime > startTime + 1) {
      setEndTime(currentTime)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(startTime, endTime)
    } finally {
      setSaving(false)
    }
  }

  const trimmedDuration = endTime - startTime

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">✂️ Trim Video</h3>
        <span className="text-sm text-[var(--foreground-muted)]">
          Trimmed: {formatTime(trimmedDuration)}
        </span>
      </div>

      {/* Video Player */}
      <div className="relative bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          src={videoUrl}
          crossOrigin="anonymous"
          className="w-full aspect-video"
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          playsInline
        />
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => handleSeek(Math.max(0, currentTime - 5))}
          className="btn btn-ghost p-2"
          title="Back 5s"
        >
          ⏪
        </button>
        <button
          onClick={() => handleSeek(Math.max(0, currentTime - 0.1))}
          className="btn btn-ghost p-2"
          title="Back 0.1s"
        >
          ◀️
        </button>
        <button
          onClick={handlePlayPause}
          className="btn btn-primary px-6"
        >
          {isPlaying ? '⏸️ Pause' : '▶️ Play'}
        </button>
        <button
          onClick={() => handleSeek(Math.min(duration, currentTime + 0.1))}
          className="btn btn-ghost p-2"
          title="Forward 0.1s"
        >
          ▶️
        </button>
        <button
          onClick={() => handleSeek(Math.min(duration, currentTime + 5))}
          className="btn btn-ghost p-2"
          title="Forward 5s"
        >
          ⏩
        </button>
      </div>

      {/* Timeline with trim handles */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-[var(--foreground-muted)]">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Visual timeline */}
        <div className="relative h-12 bg-[var(--background-elevated)] rounded-lg overflow-hidden">
          {/* Trimmed region highlight */}
          <div
            className="absolute top-0 bottom-0 bg-[var(--accent-primary)]/30"
            style={{
              left: `${(startTime / duration) * 100}%`,
              width: `${((endTime - startTime) / duration) * 100}%`,
            }}
          />

          {/* Current position indicator */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-white shadow-lg"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />

          {/* Clickable timeline */}
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        {/* Trim sliders */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="flex items-center justify-between text-sm mb-1">
              <span>Start: {formatTime(startTime)}</span>
              <button
                onClick={handleSetStart}
                className="text-xs text-[var(--accent-primary)]"
              >
                Set to current
              </button>
            </label>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={startTime}
              onChange={handleStartChange}
              className="w-full accent-[var(--accent-info)]"
            />
          </div>
          <div>
            <label className="flex items-center justify-between text-sm mb-1">
              <span>End: {formatTime(endTime)}</span>
              <button
                onClick={handleSetEnd}
                className="text-xs text-[var(--accent-primary)]"
              >
                Set to current
              </button>
            </label>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={endTime}
              onChange={handleEndChange}
              className="w-full accent-[var(--accent-secondary)]"
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {onCancel && (
          <button onClick={onCancel} className="btn btn-secondary flex-1">
            Cancel
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary flex-1"
        >
          {saving ? 'Saving...' : '💾 Save Trim Points'}
        </button>
      </div>

      <p className="text-xs text-[var(--foreground-muted)] text-center">
        Tip: The video won&apos;t be re-encoded. These points mark where annotation will start/end.
      </p>
    </div>
  )
}
