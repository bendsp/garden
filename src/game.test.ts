import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CELL_BY_KEY,
  CELLS,
  type Board,
  type MarbleType,
  STARTING_COUNTS,
  MARBLE_MARKS,
  applyRemoval,
  canSelect,
  cellKey,
  generateBoard,
  isFree,
  isPairMatch,
  isSingleMatch,
  legalMoves,
  parseLevelsDat,
  validateGeneratedBoard,
} from './game'

function makeMarble(type: MarbleType, q: number, r: number) {
  const cell = CELL_BY_KEY.get(cellKey(q, r))
  if (!cell) {
    throw new Error('Invalid test cell.')
  }
  return { id: `${type}-${q}-${r}`, type, cell }
}

describe('garden rules', () => {
  it('uses a radius-5 hex board with 91 cells', () => {
    expect(CELLS).toHaveLength(91)
  })

  it('generates a 55-marble board with the canonical starting counts', () => {
    const game = generateBoard(1234)
    const counts = Object.values(game.board).reduce(
      (acc, marble) => {
        acc[marble.type] += 1
        return acc
      },
      Object.fromEntries(Object.keys(STARTING_COUNTS).map((type) => [type, 0])) as Record<MarbleType, number>,
    )

    expect(Object.values(game.board)).toHaveLength(55)
    expect(counts).toEqual(STARTING_COUNTS)
  })

  it('generates a board with a replayable clearing solution', () => {
    const game = generateBoard(98765)
    expect(validateGeneratedBoard(game.board, game.solution)).toBe(true)
  })

  it('requires three contiguous empty neighbor spaces for a marble to be free', () => {
    const center = makeMarble('air', 0, 0)
    const blockerCells = [
      [1, 0],
      [0, -1],
      [-1, 0],
    ] as const
    const blockedBoard: Board = { [center.cell.key]: center }
    blockerCells.forEach(([q, r], index) => {
      const blocker = makeMarble('salt', q, r)
      blockedBoard[blocker.cell.key] = { ...blocker, id: `b-${index}` }
    })

    expect(isFree(blockedBoard, center)).toBe(false)

    const openBoard = { ...blockedBoard }
    delete openBoard[cellKey(1, 0)]
    expect(isFree(openBoard, center)).toBe(true)
  })

  it('enforces matching pairs and metal unlock order', () => {
    expect(isPairMatch('air', 'air', 0)).toBe(true)
    expect(isPairMatch('air', 'fire', 0)).toBe(false)
    expect(isPairMatch('salt', 'earth', 0)).toBe(true)
    expect(isPairMatch('vitae', 'mors', 0)).toBe(true)
    expect(isPairMatch('lead', 'quicksilver', 0)).toBe(true)
    expect(isPairMatch('tin', 'quicksilver', 0)).toBe(false)
    expect(isPairMatch('tin', 'quicksilver', 1)).toBe(true)
  })

  it('allows gold to clear as a single match only after the metal sequence is unlocked', () => {
    expect(isSingleMatch('gold', 4)).toBe(false)
    expect(isSingleMatch('gold', 5)).toBe(true)
    expect(isSingleMatch('silver', 5)).toBe(false)
  })

  it('reports no legal moves only when no playable match exists', () => {
    const air = makeMarble('air', 0, 0)
    const fire = makeMarble('fire', 5, 0)
    const secondAir = makeMarble('air', -5, 0)

    expect(legalMoves({ [air.cell.key]: air, [fire.cell.key]: fire }, 0)).toHaveLength(0)
    expect(legalMoves({ [air.cell.key]: air, [secondAir.cell.key]: secondAir }, 0)).toHaveLength(1)
  })

  it('uses color-only elements and salt, circle quicksilver, and countdown metal labels', () => {
    expect(MARBLE_MARKS.fire).toBe('')
    expect(MARBLE_MARKS.air).toBe('')
    expect(MARBLE_MARKS.earth).toBe('')
    expect(MARBLE_MARKS.water).toBe('')
    expect(MARBLE_MARKS.salt).toBe('')
    expect(MARBLE_MARKS.quicksilver).toBe('●')
    expect(MARBLE_MARKS.lead).toBe('5')
    expect(MARBLE_MARKS.silver).toBe('1')
    expect(MARBLE_MARKS.gold).toBe('0')
  })

  it('keeps locked metals unselectable even when physically free', () => {
    const tin = makeMarble('tin', 5, 0)
    const board: Board = { [tin.cell.key]: tin }

    expect(canSelect(board, tin, 0)).toBe(false)
    expect(canSelect(board, tin, 1)).toBe(true)
  })

  it('marks a game finished when the last marble is removed', () => {
    const gold = makeMarble('gold', 0, 0)
    const game = {
      seed: 1,
      board: { [gold.cell.key]: gold },
      initialBoard: { [gold.cell.key]: gold },
      solution: [],
      selectedIds: [],
      history: [],
      metalIndex: 5,
      message: 'Test.',
      startedAt: Date.now(),
    }

    const next = applyRemoval(game, [gold.id])
    expect(Object.values(next.board)).toHaveLength(0)
    expect(next.finishedAt).toBeTypeOf('number')
    expect(next.message).toBe('Cleared.')
  })

  it('parses the project levels.dat format with gold at the center', () => {
    const buffer = new ArrayBuffer(4 + 55 * 3)
    const view = new DataView(buffer)
    view.setUint32(0, 1, true)

    const records: Array<[number, number, number]> = [[7, 5, 0]]
    const openCells = CELLS.filter((cell) => cell.key !== cellKey(0, 0))
    const push = (type: number, count: number) => {
      for (let i = 0; i < count; i += 1) {
        const cell = openCells[records.length - 1]
        records.push([type, cell.q + 5, cell.r])
      }
    }
    push(1, 4)
    push(2, 8)
    push(3, 8)
    push(4, 8)
    push(5, 8)
    push(6, 5)
    push(8, 1)
    push(9, 1)
    push(10, 1)
    push(11, 1)
    push(12, 1)
    push(13, 4)
    push(14, 4)

    records.forEach(([type, x, y], index) => {
      const offset = 4 + index * 3
      view.setUint8(offset, type)
      view.setInt8(offset + 1, x)
      view.setInt8(offset + 2, y)
    })

    const game = parseLevelsDat(buffer, 1)
    expect(Object.values(game.board)).toHaveLength(55)
    expect(game.board[cellKey(0, 0)].type).toBe('gold')
  })

  it('loads the committed first-party level pack', () => {
    const buffer = readFileSync('public/boards/levels.dat')
    const game = parseLevelsDat(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), 1)

    expect(game.levelNumber).toBeGreaterThanOrEqual(1)
    expect(Object.values(game.board)).toHaveLength(55)
    expect(game.board[cellKey(0, 0)].type).toBe('gold')
  })
})
