import { createFairTeams } from '@/lib/tournament'

describe('tournament fair teams', () => {
  test('pairs high and low ratings together', () => {
    const players = [
      { id: 'p1', name: 'A', emoji: '😀', rating: 1300 },
      { id: 'p2', name: 'B', emoji: '😎', rating: 1250 },
      { id: 'p3', name: 'C', emoji: '🤝', rating: 1000 },
      { id: 'p4', name: 'D', emoji: '🔥', rating: 900 },
    ]

    const teams = createFairTeams(players)

    expect(teams).toHaveLength(2)
    expect(teams[0].playerAId).toBe('p1')
    expect(teams[0].playerBId).toBe('p4')
    expect(teams[1].playerAId).toBe('p2')
    expect(teams[1].playerBId).toBe('p3')
  })

  test('ignores odd leftover player in team generation', () => {
    const players = [
      { id: 'p1', name: 'A', emoji: '😀', rating: 1300 },
      { id: 'p2', name: 'B', emoji: '😎', rating: 1200 },
      { id: 'p3', name: 'C', emoji: '🤝', rating: 1100 },
      { id: 'p4', name: 'D', emoji: '🔥', rating: 1000 },
      { id: 'p5', name: 'E', emoji: '⚡', rating: 950 },
    ]

    const teams = createFairTeams(players)

    expect(teams).toHaveLength(2)
    const allPlayerIds = teams.flatMap((t) => [t.playerAId, t.playerBId])
    expect(allPlayerIds).toContain('p1')
    expect(allPlayerIds).toContain('p5')
    expect(allPlayerIds).not.toContain('p3')
  })
})
