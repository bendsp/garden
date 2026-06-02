export type Cardinal = 'air' | 'fire' | 'water' | 'earth'
export type Alchemical = 'salt' | 'vitae' | 'mors' | 'quicksilver'
export type Metal = 'lead' | 'tin' | 'iron' | 'copper' | 'silver' | 'gold'
export type MarbleType = Cardinal | Alchemical | Metal

export type Cell = {
  q: number
  r: number
  key: string
}

export type Marble = {
  id: string
  type: MarbleType
  cell: Cell
}

export type Board = Record<string, Marble>

export type MoveSpec = {
  types: [MarbleType] | [MarbleType, MarbleType]
  ids?: string[]
}

export type GameState = {
  seed: number
  levelNumber?: number
  board: Board
  initialBoard: Board
  solution: MoveSpec[]
  selectedIds: string[]
  history: Board[]
  metalIndex: number
  message: string
  startedAt: number
  finishedAt?: number
}

const RADIUS = 5

export const DIRECTIONS: Array<[number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
]

export const METAL_ORDER: Metal[] = [
  'lead',
  'tin',
  'iron',
  'copper',
  'silver',
  'gold',
]

export const MARBLE_LABELS: Record<MarbleType, string> = {
  air: 'Air',
  fire: 'Fire',
  water: 'Water',
  earth: 'Earth',
  salt: 'Salt',
  vitae: 'Vitae',
  mors: 'Mors',
  quicksilver: 'Quicksilver',
  lead: 'Lead',
  tin: 'Tin',
  iron: 'Iron',
  copper: 'Copper',
  silver: 'Silver',
  gold: 'Gold',
}

export const MARBLE_MARKS: Record<MarbleType, string> = {
  air: '',
  fire: '',
  water: '',
  earth: '',
  salt: '',
  vitae: '+',
  mors: '−',
  quicksilver: '●',
  lead: '5',
  tin: '4',
  iron: '3',
  copper: '2',
  silver: '1',
  gold: '0',
}

export const STARTING_COUNTS: Record<MarbleType, number> = {
  air: 8,
  fire: 8,
  water: 8,
  earth: 8,
  salt: 4,
  vitae: 4,
  mors: 4,
  quicksilver: 5,
  lead: 1,
  tin: 1,
  iron: 1,
  copper: 1,
  silver: 1,
  gold: 1,
}

const CARDINALS: Cardinal[] = ['air', 'fire', 'water', 'earth']
const CELL_SET = new Set<string>()
export const CELLS: Cell[] = []
export const CELL_BY_KEY = new Map<string, Cell>()

for (let q = -RADIUS; q <= RADIUS; q += 1) {
  for (let r = -RADIUS; r <= RADIUS; r += 1) {
    if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= RADIUS) {
      const key = cellKey(q, r)
      const cell = { q, r, key }
      CELLS.push(cell)
      CELL_BY_KEY.set(key, cell)
      CELL_SET.add(key)
    }
  }
}

export function cellKey(q: number, r: number) {
  return `${q},${r}`
}

function mulberry32(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let next = Math.imul(value ^ (value >>> 15), value | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], random: () => number) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function countBoard(board: Board) {
  return Object.values(board).reduce(
    (counts, marble) => {
      counts[marble.type] += 1
      return counts
    },
    { ...emptyCounts() },
  )
}

function emptyCounts(): Record<MarbleType, number> {
  return {
    air: 0,
    fire: 0,
    water: 0,
    earth: 0,
    salt: 0,
    vitae: 0,
    mors: 0,
    quicksilver: 0,
    lead: 0,
    tin: 0,
    iron: 0,
    copper: 0,
    silver: 0,
    gold: 0,
  }
}

function cloneBoard(board: Board): Board {
  return Object.fromEntries(Object.entries(board).map(([key, marble]) => [key, { ...marble }]))
}

export function isInsideBoard(q: number, r: number) {
  return CELL_SET.has(cellKey(q, r))
}

export function isEmptyForFreedom(board: Board, q: number, r: number) {
  return !isInsideBoard(q, r) || !board[cellKey(q, r)]
}

export function isFree(board: Board, marble: Marble) {
  const empties = DIRECTIONS.map(([dq, dr]) =>
    isEmptyForFreedom(board, marble.cell.q + dq, marble.cell.r + dr),
  )

  for (let start = 0; start < DIRECTIONS.length; start += 1) {
    if (empties[start] && empties[(start + 1) % 6] && empties[(start + 2) % 6]) {
      return true
    }
  }

  return false
}

export function getUnlockedMetal(metalIndex: number): Metal {
  return METAL_ORDER[Math.min(metalIndex, METAL_ORDER.length - 1)]
}

export function isMetalUnlocked(type: MarbleType, metalIndex: number) {
  if (!METAL_ORDER.includes(type as Metal)) {
    return true
  }

  if (type === 'gold') {
    return metalIndex >= 5
  }

  return METAL_ORDER[metalIndex] === type
}

export function canSelect(board: Board, marble: Marble, metalIndex: number) {
  return isFree(board, marble) && isMetalUnlocked(marble.type, metalIndex)
}

export function isPairMatch(a: MarbleType, b: MarbleType, metalIndex: number) {
  if (CARDINALS.includes(a as Cardinal) && a === b) {
    return true
  }

  if ((a === 'salt' && (b === 'salt' || CARDINALS.includes(b as Cardinal))) ||
    (b === 'salt' && CARDINALS.includes(a as Cardinal))) {
    return true
  }

  if ((a === 'vitae' && b === 'mors') || (a === 'mors' && b === 'vitae')) {
    return true
  }

  const unlockedMetal = METAL_ORDER[metalIndex]
  return (
    ((a === unlockedMetal && b === 'quicksilver') ||
      (b === unlockedMetal && a === 'quicksilver')) &&
    unlockedMetal !== 'gold'
  )
}

export function isSingleMatch(type: MarbleType, metalIndex: number) {
  return type === 'gold' && metalIndex >= 5
}

export function legalMoves(board: Board, metalIndex: number) {
  const selectable = Object.values(board).filter((marble) => canSelect(board, marble, metalIndex))
  const moves: string[][] = []

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

function updateMetalIndex(types: MarbleType[], metalIndex: number) {
  const unlocked = METAL_ORDER[metalIndex]
  if (unlocked !== 'gold' && types.includes(unlocked) && types.includes('quicksilver')) {
    return metalIndex + 1
  }
  return metalIndex
}

export function applyRemoval(state: GameState, ids: string[]): GameState {
  const marbles = ids
    .map((id) => Object.values(state.board).find((marble) => marble.id === id))
    .filter(Boolean) as Marble[]

  const nextBoard = cloneBoard(state.board)
  for (const marble of marbles) {
    delete nextBoard[marble.cell.key]
  }

  const metalIndex = updateMetalIndex(
    marbles.map((marble) => marble.type),
    state.metalIndex,
  )
  const movesLeft = legalMoves(nextBoard, metalIndex).length
  const remaining = Object.keys(nextBoard).length
  const message =
    remaining === 0
      ? 'Cleared.'
      : movesLeft === 0
        ? 'No legal moves.'
        : `${remaining} marbles remain.`
  const finishedAt = remaining === 0 ? Date.now() : undefined

  return {
    ...state,
    board: nextBoard,
    selectedIds: [],
    metalIndex,
    history: [...state.history, state.board],
    message,
    finishedAt,
  }
}

function makeMoveBag(random: () => number): MoveSpec[] {
  const cardinalMoves = CARDINALS.flatMap((type) =>
    Array.from({ length: STARTING_COUNTS[type] / 2 }, () => ({ types: [type, type] as [MarbleType, MarbleType] })),
  )
  const neutralMoves: MoveSpec[] = [
    { types: ['salt', 'salt'] },
    { types: ['salt', 'salt'] },
    { types: ['vitae', 'mors'] },
    { types: ['vitae', 'mors'] },
    { types: ['vitae', 'mors'] },
    { types: ['vitae', 'mors'] },
  ]
  const metalMoves: MoveSpec[] = [
    { types: ['lead', 'quicksilver'] },
    { types: ['tin', 'quicksilver'] },
    { types: ['iron', 'quicksilver'] },
    { types: ['copper', 'quicksilver'] },
    { types: ['silver', 'quicksilver'] },
    { types: ['gold'] },
  ]

  return [...metalMoves, ...shuffle([...cardinalMoves, ...neutralMoves], random)]
}

function boardWithPlacement(board: Board, cells: Cell[], move: MoveSpec, prefix: string) {
  const nextBoard = cloneBoard(board)
  move.types.forEach((type, index) => {
    const cell = cells[index]
    nextBoard[cell.key] = {
      id: `${prefix}-${index}`,
      type,
      cell,
    }
  })
  return nextBoard
}

function findPlacement(board: Board, move: MoveSpec, random: () => number, prefix: string) {
  const openCells = shuffle(CELLS.filter((cell) => !board[cell.key]), random)

  if (move.types.length === 1) {
    for (const cell of openCells) {
      const candidate = boardWithPlacement(board, [cell], move, prefix)
      if (isFree(candidate, candidate[cell.key])) {
        return candidate
      }
    }
    return null
  }

  for (const first of openCells) {
    const secondCells = shuffle(openCells.filter((cell) => cell.key !== first.key), random)
    for (const second of secondCells.slice(0, 30)) {
      const candidate = boardWithPlacement(board, [first, second], move, prefix)
      if (isFree(candidate, candidate[first.key]) && isFree(candidate, candidate[second.key])) {
        return candidate
      }
    }
  }

  return null
}

export function generateBoard(seed = Math.floor(Math.random() * 2 ** 32)): GameState {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const attemptSeed = (seed + attempt * 2654435761) >>> 0
    const random = mulberry32(attemptSeed)
    const solution = makeMoveBag(random)
    let board: Board = {}
    let failed = false

    for (let i = solution.length - 1; i >= 0; i -= 1) {
      const placed = findPlacement(board, solution[i], random, `m${i}`)
      if (!placed) {
        failed = true
        break
      }
      solution[i] = {
        ...solution[i],
        ids: solution[i].types.map((_, index) => `m${i}-${index}`),
      }
      board = placed
    }

    if (!failed && validateGeneratedBoard(board, solution)) {
      const initialBoard = cloneBoard(board)
      return {
        seed: attemptSeed,
        board,
        initialBoard,
        solution,
        selectedIds: [],
        history: [],
        metalIndex: 0,
        message: 'Select a free marble.',
        startedAt: Date.now(),
      }
    }
  }

  throw new Error('Could not generate a solvable board.')
}

const DAT_TYPE_MAP: Record<number, MarbleType> = {
  1: 'salt',
  2: 'air',
  3: 'fire',
  4: 'water',
  5: 'earth',
  6: 'quicksilver',
  7: 'gold',
  8: 'silver',
  9: 'copper',
  10: 'iron',
  11: 'tin',
  12: 'lead',
  13: 'vitae',
  14: 'mors',
}

function rotate(q: number, r: number, turns: number) {
  let nextQ = q
  let nextR = r
  for (let i = 0; i < turns; i += 1) {
    ;[nextQ, nextR] = [-nextR, nextQ + nextR]
  }
  return { q: nextQ, r: nextR }
}

export function parseLevelsDat(buffer: ArrayBuffer, seed = Math.floor(Math.random() * 2 ** 32)): GameState {
  const view = new DataView(buffer)
  const boardCount = view.getUint32(0, true)
  const boardSize = 55 * 3
  if (buffer.byteLength !== 4 + boardCount * boardSize) {
    throw new Error('Invalid levels.dat size.')
  }

  const random = mulberry32(seed)
  const boardIndex = Math.floor(random() * boardCount)
  const turns = Math.floor(random() * 6)
  const board: Board = {}

  for (let i = 0; i < 55; i += 1) {
    const offset = 4 + boardIndex * boardSize + i * 3
    const type = DAT_TYPE_MAP[view.getUint8(offset)]
    const sourceQ = view.getInt8(offset + 1) - 5
    const sourceR = view.getInt8(offset + 2)
    const rotated = rotate(sourceQ, sourceR, turns)
    const cell = CELL_BY_KEY.get(cellKey(rotated.q, rotated.r))
    if (!type || !cell) {
      throw new Error('Invalid levels.dat board record.')
    }
    board[cell.key] = {
      id: `d${boardIndex}-${i}`,
      type,
      cell,
    }
  }

  const counts = countBoard(board)
  const countsOk = Object.entries(STARTING_COUNTS).every(
    ([type, count]) => counts[type as MarbleType] === count,
  )
  if (!countsOk || Object.keys(board).length !== 55) {
    throw new Error('Invalid levels.dat marble counts.')
  }

  const initialBoard = cloneBoard(board)
  return {
    seed,
    levelNumber: boardIndex + 1,
    board,
    initialBoard,
    solution: [],
    selectedIds: [],
    history: [],
    metalIndex: 0,
    message: `Level ${boardIndex + 1}.`,
    startedAt: Date.now(),
  }
}

export function validateGeneratedBoard(board: Board, solution: MoveSpec[]) {
  const counts = countBoard(board)
  const countsOk = Object.entries(STARTING_COUNTS).every(
    ([type, count]) => counts[type as MarbleType] === count,
  )
  if (!countsOk || Object.keys(board).length !== 55 || CELLS.length !== 91) {
    return false
  }

  const replayBoard = cloneBoard(board)
  let metalIndex = 0
  for (const move of solution) {
    const chosen = move.ids
      ? move.ids.map((id) => Object.values(replayBoard).find((marble) => marble.id === id))
      : move.types.map((type) => Object.values(replayBoard).find((marble) => marble.type === type))

    if (
      chosen.some((marble) => !marble) ||
      chosen.some((marble) => !canSelect(replayBoard, marble as Marble, metalIndex))
    ) {
      return false
    }

    const marbles = chosen as Marble[]

    if (
      marbles.length === 1
        ? !isSingleMatch(marbles[0].type, metalIndex)
        : !isPairMatch(marbles[0].type, marbles[1].type, metalIndex)
    ) {
      return false
    }

    for (const marble of marbles) {
      delete replayBoard[marble.cell.key]
    }
    metalIndex = updateMetalIndex(
      marbles.map((marble) => marble.type),
      metalIndex,
    )
  }

  return Object.keys(replayBoard).length === 0
}

export function restartGame(state: GameState): GameState {
  return {
    ...state,
    board: cloneBoard(state.initialBoard),
    selectedIds: [],
    history: [],
    metalIndex: 0,
    message: 'Restarted.',
    startedAt: Date.now(),
    finishedAt: undefined,
  }
}

export function undoGame(state: GameState): GameState {
  const previous = state.history.at(-1)
  if (!previous) {
    return state
  }

  const restored = cloneBoard(previous)
  let metalIndex = 0
  const removedTypes = Object.values(state.initialBoard)
    .filter((initial) => !restored[initial.cell.key])
    .map((marble) => marble.type)

  for (const metal of METAL_ORDER.slice(0, 5)) {
    if (removedTypes.includes(metal) && removedTypes.includes('quicksilver')) {
      metalIndex += 1
    }
  }

  return {
    ...state,
    board: restored,
    selectedIds: [],
    history: state.history.slice(0, -1),
    metalIndex,
    message: 'Undone.',
    finishedAt: undefined,
  }
}
