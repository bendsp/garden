import { useEffect, useState } from 'react'
import './App.css'
import { playMatchSound, playSelectSound } from './audio'
import {
  CELLS,
  MARBLE_LABELS,
  MARBLE_MARKS,
  type GameState,
  type Marble,
  type MarbleType,
  applyRemoval,
  canSelect,
  getUnlockedMetal,
  isPairMatch,
  isSingleMatch,
  parseLevelsDat,
  restartGame,
  undoGame,
} from './game'

const HEX_SIZE = 31
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE
const HEX_HEIGHT = 2 * HEX_SIZE
const DESKTOP_BOARD_PADDING = 44
const MOBILE_BOARD_PADDING = 4

const TYPE_ORDER: MarbleType[] = [
  'salt',
  'fire',
  'air',
  'earth',
  'water',
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

function getBoardMetrics(padding: number) {
  return {
    width: HEX_WIDTH * 11 + padding * 2,
    height: HEX_HEIGHT * 8.5 + padding * 2,
  }
}

function toPoint(q: number, r: number, board: ReturnType<typeof getBoardMetrics>) {
  return {
    x: board.width / 2 + HEX_SIZE * Math.sqrt(3) * (q + r / 2),
    y: board.height / 2 + HEX_SIZE * 1.5 * r,
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

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)

    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
}

function App() {
  const [game, setGame] = useState<GameState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [wins, setWins] = useState(() => Number(localStorage.getItem('garden:wins') ?? '0'))
  const [countedWin, setCountedWin] = useState<string | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const usesMobileBoard = useMediaQuery('(max-width: 680px)')
  const boardMetrics = getBoardMetrics(usesMobileBoard ? MOBILE_BOARD_PADDING : DESKTOP_BOARD_PADDING)
  const marbles = game ? Object.values(game.board) : []
  const selectedMarbles = game
    ? game.selectedIds
    .map((id) => marbles.find((marble) => marble.id === id))
    .filter(Boolean) as Marble[]
    : []
  const counts = TYPE_ORDER.map((type) => ({
    type,
    count: marbles.filter((marble) => marble.type === type).length,
  }))

  async function newGame() {
    const seed = Math.floor(Math.random() * 2 ** 32)
    try {
      const response = await fetch('/boards/levels.dat', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('Could not load level data.')
      }
      const buffer = await response.arrayBuffer()
      setGame(parseLevelsDat(buffer, seed))
      setCountedWin(null)
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load level data.')
    }
  }

  useEffect(() => {
    let cancelled = false
    const seed = Math.floor(Math.random() * 2 ** 32)
    fetch('/boards/levels.dat', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Could not load level data.')
        }
        return response.arrayBuffer()
      })
      .then((buffer) => {
        if (!cancelled) {
          setGame(parseLevelsDat(buffer, seed))
          setLoadError('')
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Could not load level data.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  function recordWin(nextGame: GameState) {
    if (!nextGame.finishedAt) {
      return
    }

    const winKey = `${nextGame.seed}:${nextGame.finishedAt}`
    if (countedWin === winKey) {
      return
    }

    setCountedWin(winKey)
    setWins((current) => {
      const next = current + 1
      localStorage.setItem('garden:wins', String(next))
      return next
    })
  }

  function removeMarbles(ids: string[]) {
    if (!game) {
      return
    }

    const nextGame = applyRemoval(game, ids)
    recordWin(nextGame)
    setGame(nextGame)
  }

  function selectMarble(marble: Marble) {
    if (!game || game.finishedAt) {
      return
    }

    if (!canSelect(game.board, marble, game.metalIndex)) {
      setGame((current) =>
        current
          ? {
              ...current,
              selectedIds: [],
              message:
                marble.type === getUnlockedMetal(current.metalIndex) || marble.type === 'quicksilver'
                  ? 'That marble is still blocked.'
                  : `${MARBLE_LABELS[marble.type]} is locked for now.`,
            }
          : current,
      )
      return
    }

    if (game.selectedIds.includes(marble.id)) {
      if (isSingleMatch(marble.type, game.metalIndex)) {
        playMatchSound()
        removeMarbles([marble.id])
        return
      }

      setGame((current) =>
        current
          ? {
              ...current,
              selectedIds: current.selectedIds.filter((id) => id !== marble.id),
              message: 'Selection cleared.',
            }
          : current,
      )
      return
    }

    if (selectedMarbles.length === 0) {
      playSelectSound()
      setGame((current) =>
        current
          ? {
              ...current,
              selectedIds: [marble.id],
              message: describeSelection([marble.type], current.metalIndex),
            }
          : current,
      )
      return
    }

    const first = selectedMarbles[0]
    if (isPairMatch(first.type, marble.type, game.metalIndex)) {
      playMatchSound()
      removeMarbles([first.id, marble.id])
      return
    }

    playSelectSound()
    setGame((current) =>
      current
        ? {
            ...current,
            selectedIds: [marble.id],
            message: describeSelection([marble.type], current.metalIndex),
          }
        : current,
    )
  }

  if (!game) {
    return (
      <main className="app app-loading">
        <h1>Garden</h1>
        <p>{loadError || 'Loading levels.'}</p>
        {loadError && (
          <button type="button" onClick={() => void newGame()}>
            Retry
          </button>
        )}
      </main>
    )
  }

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>Garden</h1>
        </div>
        <div className="actions" aria-label="Game controls">
          <button type="button" onClick={() => setRulesOpen((open) => !open)}>
            Rules
          </button>
          <button
            type="button"
            onClick={() => setGame((current) => (current ? undoGame(current) : current))}
            disabled={!game.history.length}
          >
            Undo
          </button>
          <button type="button" onClick={() => setGame((current) => (current ? restartGame(current) : current))}>
            Restart
          </button>
          <button type="button" onClick={() => void newGame()}>
            New
          </button>
        </div>
      </header>

      <section className="board-wrap" aria-label="Puzzle board">
        <svg className="board" viewBox={`0 0 ${boardMetrics.width} ${boardMetrics.height}`} role="img" aria-label="Hexagonal puzzle board">
          <defs>
            <linearGradient id="salt-rainbow" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7065f2" />
              <stop offset="22%" stopColor="#d94fa1" />
              <stop offset="40%" stopColor="#ec5b43" />
              <stop offset="58%" stopColor="#efcf58" />
              <stop offset="76%" stopColor="#55c77d" />
              <stop offset="100%" stopColor="#4d9ce8" />
            </linearGradient>
          </defs>
          <g className="grid">
            {CELLS.map((cell) => {
              const point = toPoint(cell.q, cell.r, boardMetrics)
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
              const point = toPoint(marble.cell.q, marble.cell.r, boardMetrics)
              const free = canSelect(game.board, marble, game.metalIndex)
              const selected = game.selectedIds.includes(marble.id)
              const mark = MARBLE_MARKS[marble.type]
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
                  {mark && (
                    <text aria-hidden="true" textAnchor="middle" dominantBaseline="central">
                      {mark}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </svg>
      </section>

      <section className="tray" aria-label="Remaining marbles">
        {counts.map(({ type, count }) => (
          <div key={type} className={`token marble-${type}`} title={MARBLE_LABELS[type]}>
            {MARBLE_MARKS[type] && <span>{MARBLE_MARKS[type]}</span>}
            <strong>{count}</strong>
          </div>
        ))}
      </section>

      {game.finishedAt && (
        <section className="result" aria-label="Win result">
          <div>
            <h2>Cleared</h2>
            <p>{formatTime(game.finishedAt - game.startedAt)} · {wins} wins</p>
          </div>
          <button type="button" onClick={() => void newGame()}>
            New game
          </button>
        </section>
      )}

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
