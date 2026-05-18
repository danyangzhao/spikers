const mockPrismaSeasonFindFirst = jest.fn()
const mockPrismaSeasonFindMany = jest.fn()
const mockPrismaSeasonCreate = jest.fn()
const mockPrismaGameCount = jest.fn()
const mockPrismaGameFindMany = jest.fn()
const mockPrismaPlayerFindMany = jest.fn()
const mockPrismaTransaction = jest.fn()

const mockTxSeasonFindFirst = jest.fn()
const mockTxSeasonUpdate = jest.fn()
const mockTxSeasonCreate = jest.fn()
const mockTxPlayerUpdateMany = jest.fn()
const mockTxPlayerFindMany = jest.fn()
const mockTxGameFindMany = jest.fn()
const mockTxSeasonStandingCreateMany = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    season: {
      findFirst: (...args: unknown[]) => mockPrismaSeasonFindFirst(...args),
      findMany: (...args: unknown[]) => mockPrismaSeasonFindMany(...args),
      create: (...args: unknown[]) => mockPrismaSeasonCreate(...args),
    },
    game: {
      count: (...args: unknown[]) => mockPrismaGameCount(...args),
      findMany: (...args: unknown[]) => mockPrismaGameFindMany(...args),
    },
    player: {
      findMany: (...args: unknown[]) => mockPrismaPlayerFindMany(...args),
    },
    $transaction: (...args: unknown[]) => mockPrismaTransaction(...args),
  },
}))

import { getSeasonById, listSeasons, startNewSeason } from '@/lib/seasons'

const txClient = {
  season: {
    findFirst: (...args: unknown[]) => mockTxSeasonFindFirst(...args),
    update: (...args: unknown[]) => mockTxSeasonUpdate(...args),
    create: (...args: unknown[]) => mockTxSeasonCreate(...args),
  },
  player: {
    updateMany: (...args: unknown[]) => mockTxPlayerUpdateMany(...args),
    findMany: (...args: unknown[]) => mockTxPlayerFindMany(...args),
  },
  game: {
    findMany: (...args: unknown[]) => mockTxGameFindMany(...args),
  },
  seasonStanding: {
    createMany: (...args: unknown[]) => mockTxSeasonStandingCreateMany(...args),
  },
}

describe('season scheduling and activation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrismaTransaction.mockImplementation(async (callback: (tx: typeof txClient) => unknown) => callback(txClient))
  })

  it('does not mutate player state when scheduling a future season', async () => {
    const existingPlayers = [
      { id: 'p1', rating: 1240, isActive: true },
      { id: 'p2', rating: 1110, isActive: true },
      { id: 'p3', rating: 980, isActive: false },
    ]
    const beforeSnapshot = new Map(existingPlayers.map((p) => [p.id, { rating: p.rating, isActive: p.isActive }]))

    mockPrismaPlayerFindMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }])
    mockPrismaSeasonFindFirst.mockResolvedValue(null) // activateDueScheduledSeason due lookup
    mockTxSeasonFindFirst
      .mockResolvedValueOnce({
        id: 'active-season',
        groupId: 'group-1',
        number: 3,
        isActive: true,
      }) // current active season
      .mockResolvedValueOnce(null) // existing scheduled announcement lookup
    mockTxSeasonCreate.mockResolvedValue({
      id: 'scheduled-season',
      groupId: 'group-1',
      number: 4,
      isActive: false,
    })

    const scheduledStartAt = new Date(Date.now() + 60 * 60 * 1000)
    await startNewSeason({
      groupId: 'group-1',
      carryOverPlayerIds: ['p1', 'p2'],
      scheduledStartAt,
      name: 'Summer',
    })

    const afterSnapshot = new Map(existingPlayers.map((p) => [p.id, { rating: p.rating, isActive: p.isActive }]))

    expect(afterSnapshot).toEqual(beforeSnapshot)
    expect(mockTxPlayerUpdateMany).not.toHaveBeenCalled()
    expect(mockTxSeasonCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          carryOverPlayerIds: ['p1', 'p2'],
        }),
      })
    )
  })

  it('resets carryover players and deactivates older non-carryover players on due activation', async () => {
    const dueSeason = {
      id: 'season-2',
      groupId: 'group-1',
      isActive: false,
      endedAt: null,
      scheduledStartAt: new Date('2026-05-01T10:00:00.000Z'),
      announcedAt: new Date('2026-04-28T10:00:00.000Z'),
      carryOverPlayerIds: ['p1', 'p2'],
    }

    mockPrismaSeasonFindFirst.mockResolvedValueOnce(dueSeason)
    mockTxSeasonFindFirst.mockResolvedValueOnce(null) // no currently active season
    mockTxSeasonUpdate.mockResolvedValueOnce({ ...dueSeason, isActive: true })
    mockPrismaSeasonFindMany.mockResolvedValueOnce([{ id: 'season-2' }])

    await listSeasons('group-1')

    expect(mockTxPlayerUpdateMany).toHaveBeenCalledTimes(2)
    expect(mockTxPlayerUpdateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: 'group-1',
          id: { in: ['p1', 'p2'] },
        }),
        data: { rating: 1000, isActive: true },
      })
    )
    expect(mockTxPlayerUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: 'group-1',
          id: { notIn: ['p1', 'p2'] },
          createdAt: { lt: dueSeason.announcedAt },
        }),
        data: { isActive: false },
      })
    )
  })

  it('does not update any players when due season has empty carryover roster', async () => {
    mockPrismaSeasonFindFirst.mockResolvedValueOnce({
      id: 'season-2',
      groupId: 'group-1',
      isActive: false,
      endedAt: null,
      scheduledStartAt: new Date('2026-05-01T10:00:00.000Z'),
      announcedAt: new Date('2026-04-28T10:00:00.000Z'),
      carryOverPlayerIds: [],
    })
    mockTxSeasonFindFirst.mockResolvedValueOnce(null)
    mockTxSeasonUpdate.mockResolvedValueOnce({ id: 'season-2', isActive: true })
    mockPrismaSeasonFindMany.mockResolvedValueOnce([{ id: 'season-2' }])

    await listSeasons('group-1')

    expect(mockTxPlayerUpdateMany).not.toHaveBeenCalled()
  })
})

describe('getSeasonById live standings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrismaTransaction.mockImplementation(async (callback: (tx: typeof txClient) => unknown) => callback(txClient))
  })

  it('returns [] standings for active season with zero games', async () => {
    mockPrismaSeasonFindFirst.mockResolvedValueOnce(null) // activateDueScheduledSeason due lookup
    mockPrismaSeasonFindFirst.mockResolvedValueOnce({
      id: 'season-active',
      groupId: 'group-1',
      isActive: true,
      standings: [{ id: 'stale-standing' }],
      sessions: [],
      badges: [],
    })
    mockPrismaGameCount.mockResolvedValueOnce(0)

    const season = await getSeasonById('group-1', 'season-active')

    expect(season?.standings).toEqual([])
    expect(mockPrismaPlayerFindMany).not.toHaveBeenCalled()
    expect(mockPrismaGameFindMany).not.toHaveBeenCalled()
  })

  it('computes live standings for active season when games exist', async () => {
    mockPrismaSeasonFindFirst.mockResolvedValueOnce(null) // activateDueScheduledSeason due lookup
    mockPrismaSeasonFindFirst.mockResolvedValueOnce({
      id: 'season-active',
      groupId: 'group-1',
      isActive: true,
      standings: [],
      sessions: [],
      badges: [],
    })
    mockPrismaGameCount.mockResolvedValueOnce(1)
    mockPrismaPlayerFindMany.mockResolvedValueOnce([
      { id: 'p1', name: 'Alice', emoji: '😀', rating: 1200 },
      { id: 'p2', name: 'Bob', emoji: '😎', rating: 1100 },
    ])
    mockPrismaGameFindMany.mockResolvedValueOnce([
      {
        scoreA: 21,
        scoreB: 18,
        teamAPlayers: [{ id: 'p1' }],
        teamBPlayers: [{ id: 'p2' }],
      },
    ])

    const season = await getSeasonById('group-1', 'season-active')

    expect(season?.standings).toHaveLength(2)
    expect(season?.standings[0]).toEqual(
      expect.objectContaining({
        playerId: 'p1',
        wins: 1,
        losses: 0,
        rank: 1,
        player: { id: 'p1', name: 'Alice', emoji: '😀' },
      })
    )
  })
})
