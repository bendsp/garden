import { useEffect, useState } from 'react'
import './App.css'
import {
  CELLS,
  MARBLE_LABELS,
  MARBLE_MARKS,
  METAL_ORDER,
  type Marble,
  type MarbleType,
  applyRemoval,
  canSelect,
  generateBoard,
  getUnlockedMetal,
  isPairMatch,
  isSingleMatch,
  legalMoves,
  parseSolitaireDat,
  restartGame,
  undoGame,
} from './game'

const HEX_SIZE = 31
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE
const HEX_HEIGHT = 2 * HEX_SIZE
const BOARD_PADDING = 44
const BOARD_WIDTH = HEX_WIDTH * 11 + BOARD_PADDING * 2
const BOARD_HEIGHT = HEX_HEIGHT * 8.5 + BOARD_PADDING * 2

const TYPE_ORDER: MarbleType[] = [
  'salt',
  'air',
  'fire',
  'water',
  'earth',
  'vitae',
  'mors',
  'lead',
  'tin',
  'iron',
  'copper',
  'silver',
  'quicksilver',
  'gold',
]

function toPoint(q: number, r: number) {
  return {
    x: BOARD_WIDTH / 2 + HEX_SIZE * Math.sqrt(3) * (q + r / 2),
    y: BOARD_HEIGHT / 2 + HEX_SIZE * 1.5 * r,
  }
}

function hexPoints(size: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 30)
    return `${Math.cos(angle) * size},${Math.sin(angle) * size}`
  }).join(' ')
}

function describeSelection(types: MarbleType[], metalIndex: number) {
  if (types.length === 0) {
    return 'Select a free marble.'
  }

  if (types.length === 1) {
    const type = types[0]
    if (isSingleMatch(type, metalIndex)) {
      return 'Tap gold again to clear it.'
    }
    return `${MARBLE_LABELS[type]} selected. Choose a matching free marble.`
  }

  return isPairMatch(types[0], types[1], metalIndex) ? 'Match.' : 'Not a match.'
}

function App() {
  const [game, setGame] = useState(() => generateBoard())
  const [source, setSource] = useState<'generated' | 'local-dat'>('generated')
  const [rulesOpen, setRulesOpen] = useState(false)
  const marbles = Object.values(game.board)
  const selectedMarbles = game.selectedIds
    .map((id) => marbles.find((marble) => marble.id === id))
    .filter(Boolean) as Marble[]
  const selectedTypes = selectedMarbles.map((marble) => marble.type)
  const moveCount = legalMoves(game.board, game.metalIndex).length
  const remaining = marbles.length
  const counts = TYPE_ORDER.map((type) => ({
    type,
    count: marbles.filter((marble) => marble.type === type).length,
  }))

  async function newGame() {
    const seed = Math.floor(Math.random() * 2 ** 32)
    try {
      const response = await fetch('/boards/solitaire.dat', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('No local board data.')
      }
      const buffer = await response.arrayBuffer()
      setGame(parseSolitaireDat(buffer, seed))
      setSource('local-dat')
    } catch {
      setGame(generateBoard(seed))
      setSource('generated')
    }
  }

  useEffect(() => {
    let cancelled = false
    const seed = Math.floor(Math.random() * 2 ** 32)
    fetch('/boards/solitaire.dat', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('No local board data.')
        }
        return response.arrayBuffer()
      })
      .then((buffer) => {
        if (!cancelled) {
          setGame(parseSolitaireDat(buffer, seed))
          setSource('local-dat')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGame(generateBoard(seed))
          setSource('generated')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  function selectMarble(marble: Marble) {
    if (!canSelect(game.board, marble, game.metalIndex)) {
      setGame((current) => ({
        ...current,
        selectedIds: [],
        message:
          marble.type === getUnlockedMetal(current.metalIndex) || marble.type === 'quicksilver'
            ? 'That marble is still blocked.'
            : `${MARBLE_LABELS[marble.type]} is locked for now.`,
      }))
      return
    }

    if (game.selectedIds.includes(marble.id)) {
      if (isSingleMatch(marble.type, game.metalIndex)) {
        setGame((current) => applyRemoval(current, [marble.id]))
        return
      }

      setGame((current) => ({
        ...current,
        selectedIds: current.selectedIds.filter((id) => id !== marble.id),
        message: 'Selection cleared.',
      }))
      return
    }

    if (selectedMarbles.length === 0) {
      setGame((current) => ({
        ...current,
        selectedIds: [marble.id],
        message: describeSelection([marble.type], current.metalIndex),
      }))
      return
    }

    const first = selectedMarbles[0]
    if (isPairMatch(first.type, marble.type, game.metalIndex)) {
      setGame((current) => applyRemoval(current, [first.id, marble.id]))
      return
    }

    setGame((current) => ({
      ...current,
      selectedIds: [marble.id],
      message: describeSelection([marble.type], current.metalIndex),
    }))
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>Garden</h1>
          <p>{remaining === 0 ? 'Board cleared.' : game.message}</p>
        </div>
        <div className="actions" aria-label="Game controls">
          <button type="button" onClick={() => setGame((current) => undoGame(current))} disabled={!game.history.length}>
            Undo
          </button>
          <button type="button" onClick={() => setGame((current) => restartGame(current))}>
            Restart
          </button>
          <button type="button" onClick={() => void newGame()}>
            New
          </button>
        </div>
      </header>

      <section className="status" aria-label="Game status">
        <div>
          <span>{remaining}</span>
          <small>left</small>
        </div>
        <div>
          <span>{moveCount}</span>
          <small>moves</small>
        </div>
        <div>
          <span>{game.metalIndex >= 5 ? '6' : METAL_ORDER.indexOf(getUnlockedMetal(game.metalIndex)) + 1}</span>
          <small>{game.metalIndex >= 5 ? 'gold' : getUnlockedMetal(game.metalIndex)}</small>
        </div>
      </section>

      <section className="board-wrap" aria-label="Puzzle board">
        <svg className="board" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} role="img" aria-label="Hexagonal puzzle board">
          <g className="grid">
            {CELLS.map((cell) => {
              const point = toPoint(cell.q, cell.r)
              return (
                <polygon
                  key={cell.key}
                  points={hexPoints(HEX_SIZE - 2)}
                  transform={`translate(${point.x} ${point.y})`}
                />
              )
            })}
          </g>
          <g className="marbles">
            {marbles.map((marble) => {
              const point = toPoint(marble.cell.q, marble.cell.r)
              const free = canSelect(game.board, marble, game.metalIndex)
              const selected = game.selectedIds.includes(marble.id)
              return (
                <g
                  key={marble.id}
                  className={`marble marble-${marble.type} ${free ? 'is-free' : 'is-locked'} ${
                    selected ? 'is-selected' : ''
                  }`}
                  transform={`translate(${point.x} ${point.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${MARBLE_LABELS[marble.type]} ${free ? 'free' : 'locked'}`}
                  onClick={() => selectMarble(marble)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectMarble(marble)
                    }
                  }}
                >
                  <polygon points={hexPoints(HEX_SIZE - 5)} />
                  <text aria-hidden="true" textAnchor="middle" dominantBaseline="central">
                    {MARBLE_MARKS[marble.type]}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      </section>

      <section className="tray" aria-label="Remaining marbles">
        {counts.map(({ type, count }) => (
          <div key={type} className={`token marble-${type}`} title={MARBLE_LABELS[type]}>
            <span>{MARBLE_MARKS[type]}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </section>

      <section className="footer-row">
        <button type="button" className="link-button" onClick={() => setRulesOpen((open) => !open)}>
          {rulesOpen ? 'Hide rules' : 'Rules'}
        </button>
        <span>{source === 'local-dat' ? 'local .dat' : 'generated'} seed {game.seed}</span>
        <span>{describeSelection(selectedTypes, game.metalIndex)}</span>
      </section>

      {rulesOpen && (
        <aside className="rules-panel" aria-label="Rules summary">
          <p>Clear the board by removing two free matching marbles. A marble is free when it touches three contiguous empty spaces; outside the board counts as empty.</p>
          <p>Elements match themselves. Salt matches any element or salt. Vitae and mors match each other. Metals match quicksilver in order: 1 to 5, then gold clears alone.</p>
        </aside>
      )}
    </main>
  )
}

export default App
