/**
 * AWS S3 helper functions for video upload and retrieval
 *
 * This module provides:
 * - Pre-signed URLs for direct browser uploads (bypasses server)
 * - Pre-signed URLs for video playback
 * - Delete operations
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'spikers-videos'

// Pre-signed URL expiration times
const UPLOAD_URL_EXPIRY = 60 * 60 // 1 hour for uploads
const DOWNLOAD_URL_EXPIRY = 60 * 60 * 24 // 24 hours for playback

/**
 * Generate a unique S3 key for a video
 * Format: videos/{gameId}/{timestamp}.{extension}
 */
export function generateVideoKey(gameId: string, filename: string): string {
  const extension = filename.split('.').pop() || 'mp4'
  const timestamp = Date.now()
  return `videos/${gameId}/${timestamp}.${extension}`
}

/**
 * Get a pre-signed URL for uploading a video directly from the browser
 * This allows large file uploads without going through our server
 */
export async function getUploadUrl(
  key: string,
  contentType: string
): Promise<{ uploadUrl: string; key: string; bucket: string }> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: UPLOAD_URL_EXPIRY,
  })

  return {
    uploadUrl,
    key,
    bucket: BUCKET_NAME,
  }
}

/**
 * Get a pre-signed URL for viewing/downloading a video
 */
export async function getPlaybackUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  })

  return getSignedUrl(s3Client, command, {
    expiresIn: DOWNLOAD_URL_EXPIRY,
  })
}

/**
 * Delete a video from S3
 */
export async function deleteVideo(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  })

  await s3Client.send(command)
}

/**
 * Check if AWS credentials are configured
 */
export function isS3Configured(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET
  )
}
