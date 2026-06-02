import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const outPath = resolve('public/boards/levels.dat')
const levelCount = Number(process.argv[2] ?? 500)
const radius = 5
const maskRadius = 4

const directions = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
]

const cardinals = ['air', 'fire', 'water', 'earth']
const metalOrder = ['lead', 'tin', 'iron', 'copper', 'silver', 'gold']
const typeCode = {
  salt: 1,
  air: 2,
  fire: 3,
  water: 4,
  earth: 5,
  quicksilver: 6,
  gold: 7,
  silver: 8,
  copper: 9,
  iron: 10,
  tin: 11,
  lead: 12,
  vitae: 13,
  mors: 14,
}

const allCells = []
const allKeys = new Set()
for (let q = -radius; q <= radius; q += 1) {
  for (let r = -radius; r <= radius; r += 1) {
    if (hexDistance(q, r) <= radius) {
      const cell = { q, r, key: cellKey(q, r) }
      allCells.push(cell)
      allKeys.add(cell.key)
    }
  }
}

const removedCorners = new Set([
  cellKey(4, 0),
  cellKey(0, 4),
  cellKey(-4, 4),
  cellKey(-4, 0),
  cellKey(0, -4),
  cellKey(4, -4),
])

const maskCells = allCells.filter((cell) => hexDistance(cell.q, cell.r) <= maskRadius && !removedCorners.has(cell.key))

if (maskCells.length !== 55) {
  throw new Error(`Expected 55 cells in generation mask, found ${maskCells.length}`)
}

function cellKey(q, r) {
  return `${q},${r}`
}

function hexDistance(q, r) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))
}

function mulberry32(seed) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let next = Math.imul(value ^ (value >>> 15), value | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(items, random) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function isInsideBoard(q, r) {
  return allKeys.has(cellKey(q, r))
}

function isEmptyForFreedom(board, q, r) {
  return !isInsideBoard(q, r) || !board.has(cellKey(q, r))
}

function isFree(board, marble) {
  const empties = directions.map(([dq, dr]) => isEmptyForFreedom(board, marble.cell.q + dq, marble.cell.r + dr))
  return directions.some((_, index) => empties[index] && empties[(index + 1) % 6] && empties[(index + 2) % 6])
}

function isPairMatch(a, b, metalIndex) {
  if (cardinals.includes(a) && a === b) {
    return true
  }

  if ((a === 'salt' && (b === 'salt' || cardinals.includes(b))) || (b === 'salt' && cardinals.includes(a))) {
    return true
  }

  if ((a === 'vitae' && b === 'mors') || (a === 'mors' && b === 'vitae')) {
    return true
  }

  const unlockedMetal = metalOrder[metalIndex]
  return unlockedMetal !== 'gold' && (
    (a === unlockedMetal && b === 'quicksilver') ||
    (b === unlockedMetal && a === 'quicksilver')
  )
}

function isSingleMatch(type, metalIndex) {
  return type === 'gold' && metalIndex >= 5
}

function canSelect(board, marble, metalIndex) {
  if (!isFree(board, marble)) {
    return false
  }

  if (!metalOrder.includes(marble.type)) {
    return true
  }

  return marble.type === 'gold' ? metalIndex >= 5 : metalOrder[metalIndex] === marble.type
}

function legalMoves(board, metalIndex) {
  const selectable = [...board.values()].filter((marble) => canSelect(board, marble, metalIndex))
  const moves = []

  for (const marble of selectable) {
    if (isSingleMatch(marble.type, metalIndex)) {
      moves.push([marble.id])
    }
  }

  for (let i = 0; i < selectable.length; i += 1) {
    for (let j = i + 1; j < selectable.length; j += 1) {
      if (isPairMatch(selectable[i].type, selectable[j].type, metalIndex)) {
        moves.push([selectable[i].id, selectable[j].id])
      }
    }
  }

  return moves
}

function updateMetalIndex(types, metalIndex) {
  const unlocked = metalOrder[metalIndex]
  return unlocked !== 'gold' && types.includes(unlocked) && types.includes('quicksilver')
    ? metalIndex + 1
    : metalIndex
}

function makeSolution(random) {
  const nonMetals = [
    ...cardinals.flatMap((type) => Array.from({ length: 4 }, () => ({ types: [type, type] }))),
    { types: ['salt', 'salt'] },
    { types: ['salt', 'salt'] },
    { types: ['vitae', 'mors'] },
    { types: ['vitae', 'mors'] },
    { types: ['vitae', 'mors'] },
    { types: ['vitae', 'mors'] },
  ]
  const shuffledNonMetals = shuffle(nonMetals, random)
  const metalMoves = [
    { types: ['lead', 'quicksilver'] },
    { types: ['tin', 'quicksilver'] },
    { types: ['iron', 'quicksilver'] },
    { types: ['copper', 'quicksilver'] },
    { types: ['silver', 'quicksilver'] },
  ]
  const metalSlots = Array.from({ length: metalMoves.length }, () => Math.floor(random() * (shuffledNonMetals.length + 1))).sort(
    (a, b) => a - b,
  )
  const solution = []
  let metalIndex = 0

  for (let slot = 0; slot <= shuffledNonMetals.length; slot += 1) {
    while (metalSlots[metalIndex] === slot) {
      solution.push(metalMoves[metalIndex])
      metalIndex += 1
    }

    if (slot < shuffledNonMetals.length) {
      solution.push(shuffledNonMetals[slot])
    }
  }

  solution.push({ types: ['gold'] })
  return solution
}

function cloneBoard(board) {
  return new Map([...board.entries()].map(([key, marble]) => [key, { ...marble }]))
}

function candidateBoard(board, cells, move, prefix) {
  const next = cloneBoard(board)
  move.types.forEach((type, index) => {
    const cell = cells[index]
    next.set(cell.key, {
      id: `${prefix}-${index}`,
      type,
      cell,
    })
  })
  return next
}

function occupiedNeighborScore(board, cell) {
  return directions.reduce((score, [dq, dr]) => score + (board.has(cellKey(cell.q + dq, cell.r + dr)) ? 1 : 0), 0)
}

function placementScore(board, cells, random) {
  const adjacency = cells.reduce((score, cell) => score + occupiedNeighborScore(board, cell), 0)
  const centrality = cells.reduce((score, cell) => score - hexDistance(cell.q, cell.r), 0)
  const separation = cells.length === 2 ? hexDistance(cells[0].q - cells[1].q, cells[0].r - cells[1].r) : 0
  return adjacency * 12 + centrality * 3 + separation + random()
}

function findPlacement(board, move, random, prefix) {
  if (move.types.length === 1) {
    const center = maskCells.find((cell) => cell.q === 0 && cell.r === 0)
    if (!center || board.has(center.key)) {
      return null
    }

    const candidate = candidateBoard(board, [center], move, prefix)
    return isFree(candidate, candidate.get(center.key)) ? candidate : null
  }

  const openCells = maskCells.filter((cell) => !board.has(cell.key))
  let best = null
  let bestScore = -Infinity

  for (let i = 0; i < openCells.length; i += 1) {
    for (let j = i + 1; j < openCells.length; j += 1) {
      const cells = random() < 0.5 ? [openCells[i], openCells[j]] : [openCells[j], openCells[i]]
      const candidate = candidateBoard(board, cells, move, prefix)
      if (!isFree(candidate, candidate.get(cells[0].key)) || !isFree(candidate, candidate.get(cells[1].key))) {
        continue
      }

      const score = placementScore(board, cells, random)
      if (score > bestScore) {
        best = candidate
        bestScore = score
      }
    }
  }

  return best
}

function validateSolution(board, solution) {
  const replay = cloneBoard(board)
  let metalIndex = 0

  for (const move of solution) {
    const marbles = move.ids.map((id) => [...replay.values()].find((marble) => marble.id === id))
    if (marbles.some((marble) => !marble || !canSelect(replay, marble, metalIndex))) {
      return false
    }

    const types = marbles.map((marble) => marble.type)
    const match = marbles.length === 1 ? isSingleMatch(types[0], metalIndex) : isPairMatch(types[0], types[1], metalIndex)
    if (!match) {
      return false
    }

    for (const marble of marbles) {
      replay.delete(marble.cell.key)
    }
    metalIndex = updateMetalIndex(types, metalIndex)
  }

  return replay.size === 0
}

function boardCounts(board) {
  const counts = new Map()
  for (const marble of board.values()) {
    counts.set(marble.type, (counts.get(marble.type) ?? 0) + 1)
  }
  return counts
}

function isGoodLevel(board, solution) {
  if (board.size !== 55) {
    return false
  }

  const center = board.get(cellKey(0, 0))
  if (center?.type !== 'gold') {
    return false
  }

  const counts = boardCounts(board)
  const expected = {
    salt: 4,
    air: 8,
    fire: 8,
    water: 8,
    earth: 8,
    quicksilver: 5,
    gold: 1,
    silver: 1,
    copper: 1,
    iron: 1,
    tin: 1,
    lead: 1,
    vitae: 4,
    mors: 4,
  }
  if (Object.entries(expected).some(([type, count]) => counts.get(type) !== count)) {
    return false
  }

  const initialMoves = legalMoves(board, 0).length
  return initialMoves >= 1 && initialMoves <= 8 && validateSolution(board, solution)
}

function generateLevel(seed) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const random = mulberry32((seed + attempt * 0x9e3779b9) >>> 0)
    const solution = makeSolution(random)
    let board = new Map()
    let failed = false

    for (let i = solution.length - 1; i >= 0; i -= 1) {
      const placed = findPlacement(board, solution[i], random, `s${seed}-${i}`)
      if (!placed) {
        failed = true
        break
      }
      solution[i] = {
        ...solution[i],
        ids: solution[i].types.map((_, index) => `s${seed}-${i}-${index}`),
      }
      board = placed
    }

    if (!failed && isGoodLevel(board, solution)) {
      return board
    }
  }

  return null
}

function encodeLevels(levels) {
  const boardSize = 55 * 3
  const buffer = Buffer.alloc(4 + levels.length * boardSize)
  buffer.writeUInt32LE(levels.length, 0)

  levels.forEach((board, levelIndex) => {
    const marbles = [...board.values()].sort((a, b) => {
      if (a.cell.q === 0 && a.cell.r === 0) return -1
      if (b.cell.q === 0 && b.cell.r === 0) return 1
      return a.cell.r - b.cell.r || a.cell.q - b.cell.q
    })

    marbles.forEach((marble, marbleIndex) => {
      const offset = 4 + levelIndex * boardSize + marbleIndex * 3
      buffer.writeUInt8(typeCode[marble.type], offset)
      buffer.writeInt8(marble.cell.q + 5, offset + 1)
      buffer.writeInt8(marble.cell.r, offset + 2)
    })
  })

  return buffer
}

const levels = []
let seed = 1
while (levels.length < levelCount) {
  const level = generateLevel(seed)
  if (level) {
    levels.push(level)
  }
  seed += 1
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, encodeLevels(levels))
console.log(`Wrote ${levels.length} levels to ${outPath} using seeds 1..${seed - 1}`)
