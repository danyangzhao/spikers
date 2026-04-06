/**
 * Tests for the group messages API endpoints
 *
 * POST /api/groups/[groupId]/messages - Create a group message
 * PUT /api/groups/[groupId]/messages/[messageId] - Edit a group message
 * GET /api/groups/[groupId]/messages - List group messages
 */

const mockFindMany = jest.fn()
const mockFindFirst = jest.fn()
const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockPlayerFindFirst = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    groupMessage: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    player: {
      findFirst: (...args: unknown[]) => mockPlayerFindFirst(...args),
    },
  },
}))

jest.mock('@/lib/apns', () => ({
  sendPushToGroup: jest.fn().mockResolvedValue(1),
}))

import { GET, POST } from '../../app/api/groups/[id]/messages/route'
import { PUT } from '../../app/api/groups/[id]/messages/[messageId]/route'
import { NextRequest } from 'next/server'

function createRequest(
  url: string,
  method: string,
  body?: Record<string, unknown>
): NextRequest {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) {
    options.body = JSON.stringify(body)
  }
  return new NextRequest(`http://localhost:3000${url}`, options)
}

const fakeAuthor = { id: 'player-1', name: 'Alice', emoji: '🏐' }

const fakeMessage = {
  id: 'msg-1',
  title: 'Game Saturday',
  body: 'We are playing at 2pm',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  pushSentAt: new Date().toISOString(),
  groupId: 'group-1',
  authorId: 'player-1',
  author: fakeAuthor,
}

describe('GET /api/groups/[groupId]/messages', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns messages and cooldown info', async () => {
    mockFindMany.mockResolvedValue([fakeMessage])
    mockFindFirst.mockResolvedValue({ pushSentAt: new Date() })

    const request = createRequest('/api/groups/group-1/messages', 'GET')
    const params = Promise.resolve({ groupId: 'group-1' })

    const response = await GET(request, { params })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.messages).toHaveLength(1)
    expect(data.messages[0].title).toBe('Game Saturday')
    expect(data.cooldown).toBeDefined()
    expect(data.cooldown.canPush).toBe(false)
  })
})

describe('POST /api/groups/[groupId]/messages', () => {
  beforeEach(() => jest.clearAllMocks())

  it('creates a message and sends push when cooldown expired', async () => {
    mockPlayerFindFirst.mockResolvedValue(fakeAuthor)
    // No previous pushes
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockResolvedValue(fakeMessage)

    const request = createRequest('/api/groups/group-1/messages', 'POST', {
      title: 'Game Saturday',
      messageBody: 'We are playing at 2pm',
      authorId: 'player-1',
    })
    const params = Promise.resolve({ groupId: 'group-1' })

    const response = await POST(request, { params })
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.message.title).toBe('Game Saturday')
    expect(data.pushSent).toBe(true)
  })

  it('creates a message but skips push during cooldown', async () => {
    mockPlayerFindFirst.mockResolvedValue(fakeAuthor)
    // Push was sent 1 hour ago
    mockFindFirst.mockResolvedValue({ pushSentAt: new Date() })
    mockCreate.mockResolvedValue({ ...fakeMessage, pushSentAt: null })

    const request = createRequest('/api/groups/group-1/messages', 'POST', {
      title: 'Another message',
      messageBody: 'This should not push',
      authorId: 'player-1',
    })
    const params = Promise.resolve({ groupId: 'group-1' })

    const response = await POST(request, { params })
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.pushSent).toBe(false)
  })

  it('returns 400 if title is missing', async () => {
    const request = createRequest('/api/groups/group-1/messages', 'POST', {
      messageBody: 'body text',
      authorId: 'player-1',
    })
    const params = Promise.resolve({ groupId: 'group-1' })

    const response = await POST(request, { params })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Title is required')
  })

  it('returns 400 if messageBody is missing', async () => {
    const request = createRequest('/api/groups/group-1/messages', 'POST', {
      title: 'A title',
      authorId: 'player-1',
    })
    const params = Promise.resolve({ groupId: 'group-1' })

    const response = await POST(request, { params })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Message body is required')
  })

  it('returns 404 if author not in group', async () => {
    mockPlayerFindFirst.mockResolvedValue(null)

    const request = createRequest('/api/groups/group-1/messages', 'POST', {
      title: 'title',
      messageBody: 'body',
      authorId: 'nonexistent-player',
    })
    const params = Promise.resolve({ groupId: 'group-1' })

    const response = await POST(request, { params })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Player not found in this group')
  })
})

describe('PUT /api/groups/[groupId]/messages/[messageId]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('updates message text without sending push', async () => {
    mockFindFirst.mockResolvedValue(fakeMessage)
    mockUpdate.mockResolvedValue({ ...fakeMessage, title: 'Updated Title' })

    const request = createRequest('/api/groups/group-1/messages/msg-1', 'PUT', {
      title: 'Updated Title',
      messageBody: 'Updated body',
    })
    const params = Promise.resolve({ groupId: 'group-1', messageId: 'msg-1' })

    const response = await PUT(request, { params })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.message.title).toBe('Updated Title')
    expect(data.pushSent).toBe(false)
  })

  it('returns 404 if message not found', async () => {
    mockFindFirst.mockResolvedValue(null)

    const request = createRequest('/api/groups/group-1/messages/bad-id', 'PUT', {
      title: 'title',
      messageBody: 'body',
    })
    const params = Promise.resolve({ groupId: 'group-1', messageId: 'bad-id' })

    const response = await PUT(request, { params })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Message not found')
  })

  it('returns 400 if title is missing', async () => {
    const request = createRequest('/api/groups/group-1/messages/msg-1', 'PUT', {
      messageBody: 'body',
    })
    const params = Promise.resolve({ groupId: 'group-1', messageId: 'msg-1' })

    const response = await PUT(request, { params })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Title is required')
  })
})
