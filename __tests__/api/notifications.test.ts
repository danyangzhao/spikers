/**
 * Tests for the push notification API endpoints
 *
 * These test the /api/notifications/register and /api/notifications/unregister routes
 */

// Mock Prisma before importing the route handlers
const mockUpsert = jest.fn()
const mockDelete = jest.fn()
const mockFindMany = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    deviceToken: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}))

// Mock the APNs module so tests don't try to actually send notifications
jest.mock('@/lib/apns', () => ({
  sendPushToAllDevices: jest.fn().mockResolvedValue(0),
}))

import { POST as registerPOST } from '../../app/api/notifications/register/route'
import { POST as unregisterPOST } from '../../app/api/notifications/unregister/route'
import { NextRequest } from 'next/server'

// Helper to create a fake NextRequest with a JSON body
function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/notifications/register', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/notifications/register', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('registers a new device token', async () => {
    const fakeToken = {
      id: 'token-id-123',
      token: 'abcdef1234567890',
      platform: 'ios',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockUpsert.mockResolvedValue(fakeToken)

    const request = createRequest({
      token: 'abcdef1234567890',
      platform: 'ios',
    })

    const response = await registerPOST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('registered')
    expect(data.id).toBe('token-id-123')

    // Verify prisma.upsert was called with the right arguments
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { token: 'abcdef1234567890' },
      update: {
        platform: 'ios',
        updatedAt: expect.any(Date),
      },
      create: {
        token: 'abcdef1234567890',
        platform: 'ios',
      },
    })
  })

  it('returns 400 if token is missing', async () => {
    const request = createRequest({ platform: 'ios' })

    const response = await registerPOST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Device token is required')
  })

  it('returns 400 if token is not a string', async () => {
    const request = createRequest({ token: 12345 })

    const response = await registerPOST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Device token is required')
  })

  it('defaults platform to ios', async () => {
    const fakeToken = {
      id: 'token-id-456',
      token: 'abcdef1234567890',
      platform: 'ios',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockUpsert.mockResolvedValue(fakeToken)

    const request = createRequest({ token: 'abcdef1234567890' })
    await registerPOST(request)

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ platform: 'ios' }),
      })
    )
  })
})

describe('POST /api/notifications/unregister', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('unregisters a device token', async () => {
    mockDelete.mockResolvedValue({})

    const request = createRequest({ token: 'abcdef1234567890' })

    const response = await unregisterPOST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('unregistered')
  })

  it('returns 400 if token is missing', async () => {
    const request = createRequest({})

    const response = await unregisterPOST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Device token is required')
  })

  it('succeeds even if token does not exist in database', async () => {
    // Simulate a "not found" error when trying to delete
    mockDelete.mockRejectedValue(new Error('Record not found'))

    const request = createRequest({ token: 'nonexistent-token' })

    const response = await unregisterPOST(request)
    const data = await response.json()

    // Should still return 200 — we don't care if it wasn't found
    expect(response.status).toBe(200)
    expect(data.status).toBe('unregistered')
  })
})
