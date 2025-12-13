'use client'

import { useState, useRef } from 'react'

interface VideoUploadProps {
  gameId: string
  onUploadComplete: () => void
  onCancel?: () => void
}

type UploadStatus = 'idle' | 'preparing' | 'uploading' | 'processing' | 'complete' | 'error'

export default function VideoUpload({
  gameId,
  onUploadComplete,
  onCancel,
}: VideoUploadProps) {
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('video/')) {
      setError('Please select a video file')
      return
    }

    // Validate file size (max 500MB for now)
    const maxSize = 500 * 1024 * 1024
    if (file.size > maxSize) {
      setError('Video must be less than 500MB')
      return
    }

    setError(null)
    setStatus('preparing')

    try {
      // Step 1: Get pre-signed upload URL from our API
      const prepareRes = await fetch(`/api/games/${gameId}/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      })

      if (!prepareRes.ok) {
        const data = await prepareRes.json()
        throw new Error(data.error || 'Failed to prepare upload')
      }

      const { uploadUrl } = await prepareRes.json()

      // Step 2: Upload directly to S3
      setStatus('uploading')

      await uploadToS3(uploadUrl, file)

      // Step 3: Update video status to UPLOADED
      setStatus('processing')

      // Get video duration
      const duration = await getVideoDuration(file)

      await fetch(`/api/games/${gameId}/video`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'UPLOADED',
          duration,
        }),
      })

      setStatus('complete')
      setTimeout(() => {
        onUploadComplete()
      }, 1000)
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Upload failed')
      setStatus('error')
    }
  }

  const uploadToS3 = (url: string, file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100)
          setProgress(percent)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`))
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'))
      })

      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.send(file)
    })
  }

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'

      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src)
        resolve(video.duration)
      }

      video.onerror = () => {
        resolve(0) // Return 0 if we can't get duration
      }

      video.src = URL.createObjectURL(file)
    })
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const isUploading = status === 'preparing' || status === 'uploading' || status === 'processing'

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">📹 Upload Video</h3>
        {onCancel && status === 'idle' && (
          <button onClick={onCancel} className="text-sm text-[var(--foreground-muted)]">
            Cancel
          </button>
        )}
      </div>

      {status === 'idle' && (
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
            dragActive
              ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10'
              : 'border-[var(--foreground-muted)]/30 hover:border-[var(--foreground-muted)]/50'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="text-4xl mb-3">🎬</div>
          <p className="font-medium mb-1">Drop video here or click to browse</p>
          <p className="text-sm text-[var(--foreground-muted)]">
            MP4, MOV, or WebM • Max 500MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleInputChange}
            className="hidden"
          />
        </div>
      )}

      {isUploading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="text-2xl animate-pulse">
              {status === 'preparing' && '⏳'}
              {status === 'uploading' && '📤'}
              {status === 'processing' && '⚙️'}
            </div>
            <div>
              <p className="font-medium">
                {status === 'preparing' && 'Preparing upload...'}
                {status === 'uploading' && 'Uploading video...'}
                {status === 'processing' && 'Processing...'}
              </p>
              {status === 'uploading' && (
                <p className="text-sm text-[var(--foreground-muted)]">{progress}% complete</p>
              )}
            </div>
          </div>

          {status === 'uploading' && (
            <div className="w-full bg-[var(--background-elevated)] rounded-full h-2">
              <div
                className="bg-[var(--accent-primary)] h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {status === 'complete' && (
        <div className="flex items-center gap-3 text-[var(--accent-success)]">
          <span className="text-2xl">✅</span>
          <p className="font-medium">Upload complete!</p>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-[var(--accent-danger)]">
            <span className="text-2xl">❌</span>
            <p className="font-medium">{error}</p>
          </div>
          <button
            onClick={() => {
              setStatus('idle')
              setError(null)
              setProgress(0)
            }}
            className="btn btn-secondary"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  )
}
