/**
 * Apple Push Notification Service (APNs) utility
 *
 * This module handles sending push notifications to iOS devices.
 *
 * How it works:
 * 1. We create a JWT (JSON Web Token) signed with your APNs .p8 key
 * 2. We send an HTTP/2 request to Apple's push notification servers
 * 3. Apple delivers the notification to the device
 *
 * The JWT is cached for 50 minutes (Apple requires refresh every 60 min).
 */

import jwt from 'jsonwebtoken'
import http2 from 'http2'
import { prisma } from './prisma'

// APNs server URLs
// "sandbox" is for development/testing, "production" is for App Store builds
const APNS_HOST_SANDBOX = 'https://api.sandbox.push.apple.com'
const APNS_HOST_PRODUCTION = 'https://api.push.apple.com'

// Cache the JWT so we don't recreate it for every notification
let cachedToken: string | null = null
let tokenCreatedAt: number = 0
const TOKEN_LIFETIME_MS = 50 * 60 * 1000 // 50 minutes (Apple allows up to 60)

/**
 * Get or create a JWT for authenticating with APNs.
 * Apple requires a JWT signed with your .p8 key to prove your identity.
 */
function getApnsToken(): string {
  const now = Date.now()

  // Return cached token if it's still fresh
  if (cachedToken && now - tokenCreatedAt < TOKEN_LIFETIME_MS) {
    return cachedToken
  }

  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const key = process.env.APNS_KEY

  if (!keyId || !teamId || !key) {
    throw new Error(
      'Missing APNs configuration. Set APNS_KEY_ID, APNS_TEAM_ID, and APNS_KEY environment variables.'
    )
  }

  // The key in the env var has literal "\n" strings — convert them to real newlines
  const privateKey = key.replace(/\\n/g, '\n')

  // Create the JWT
  // - "iss" (issuer) = your Apple Developer Team ID
  // - "iat" (issued at) = current time in seconds
  // - Algorithm must be ES256 (what Apple requires)
  // - "kid" (key ID) goes in the header
  cachedToken = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    issuer: teamId,
    header: {
      alg: 'ES256',
      kid: keyId,
    },
  })

  tokenCreatedAt = now
  return cachedToken
}

/**
 * Send a push notification to a single device.
 *
 * @param deviceToken - The device's APNs token (hex string from the iOS app)
 * @param title - The notification title (shown in bold)
 * @param body - The notification body text
 * @param data - Extra data to include (e.g., { sessionId: "abc123" })
 * @returns true if sent successfully, false if it failed
 */
async function sendPushNotification(
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<boolean> {
  const bundleId = process.env.APNS_BUNDLE_ID
  if (!bundleId) {
    console.error('Missing APNS_BUNDLE_ID environment variable')
    return false
  }

  // Use sandbox for development, production for App Store
  const host =
    process.env.NODE_ENV === 'production'
      ? APNS_HOST_PRODUCTION
      : APNS_HOST_SANDBOX

  try {
    const token = getApnsToken()

    // Build the notification payload
    // "aps" is the required Apple payload structure
    const payload = JSON.stringify({
      aps: {
        alert: {
          title,
          body,
        },
        sound: 'default', // Play the default notification sound
        badge: 1, // Show a badge number on the app icon
      },
      ...data, // Include any extra data (like sessionId)
    })

    // Send via HTTP/2 (Apple requires HTTP/2 for APNs)
    return await new Promise<boolean>((resolve) => {
      const client = http2.connect(host)

      client.on('error', (err) => {
        console.error('APNs connection error:', err.message)
        client.close()
        resolve(false)
      })

      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${token}`,
        'apns-topic': bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10', // 10 = send immediately
        'content-type': 'application/json',
      })

      let responseData = ''
      let statusCode = 0

      req.on('response', (headers) => {
        statusCode = headers[':status'] as number
      })

      req.on('data', (chunk) => {
        responseData += chunk.toString()
      })

      req.on('end', () => {
        client.close()
        if (statusCode === 200) {
          resolve(true)
        } else {
          console.error(
            `APNs error (${statusCode}) for token ${deviceToken.substring(0, 8)}...:`,
            responseData
          )
          resolve(false)
        }
      })

      req.on('error', (err) => {
        console.error('APNs request error:', err.message)
        client.close()
        resolve(false)
      })

      req.write(payload)
      req.end()
    })
  } catch (error) {
    console.error('APNs error:', error)
    return false
  }
}

/**
 * Send a push notification to ALL registered devices.
 * This is what gets called when a new session is created.
 *
 * @param title - The notification title
 * @param body - The notification body text
 * @param data - Extra data to include (e.g., { sessionId: "abc123" })
 * @returns Number of successfully sent notifications
 */
export async function sendPushToAllDevices(
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<number> {
  // Get all registered device tokens from the database
  const devices = await prisma.deviceToken.findMany()

  if (devices.length === 0) {
    console.log('No device tokens registered — skipping push notification')
    return 0
  }

  console.log(`Sending push notification to ${devices.length} device(s)...`)

  // Send to all devices in parallel
  const results = await Promise.all(
    devices.map(async (device) => {
      const success = await sendPushNotification(
        device.token,
        title,
        body,
        data
      )

      // If sending failed (e.g., invalid token), remove the bad token
      if (!success) {
        console.log(`Removing invalid device token: ${device.token.substring(0, 8)}...`)
        await prisma.deviceToken
          .delete({ where: { id: device.id } })
          .catch(() => {}) // Ignore errors when cleaning up
      }

      return success
    })
  )

  const successCount = results.filter(Boolean).length
  console.log(
    `Push notification sent to ${successCount}/${devices.length} device(s)`
  )
  return successCount
}
