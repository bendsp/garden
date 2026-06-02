import { Fragment, useEffect, useState } from 'react'
import './App.css'
import { playMatchSound, playSelectSound } from './audio'
import {
  CELLS,
  MARBLE_LABELS,
  MARBLE_MARKS,
  METAL_ORDER,
  type GameState,
  type Marble,
  type MarbleType,
  applyRemoval,
  canSelect,
  getUnlockedMetal,
  isPairMatch,
  isSingleMatch,
  parseLevelsDat,
  undoGame,
} from './game'

const HEX_SIZE = 31
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE
const HEX_HEIGHT = 2 * HEX_SIZE
const DESKTOP_BOARD_PADDING = 44
const MOBILE_BOARD_PADDING = 4

const INVENTORY_GUIDE_TYPES: MarbleType[] = [
  'salt',
  'fire',
  'air',
  'earth',
  'water',
  'vitae',
  'mors',
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
    return 'Select a free tile.'
  }

  if (types.length === 1) {
    const type = types[0]
    if (isSingleMatch(type, metalIndex)) {
      return 'Tap Purple 0 again to clear it.'
    }
    return `${MARBLE_LABELS[type]} selected. Choose a matching free tile.`
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

function RuleHex({
  type,
  mark,
  empty = false,
  locked = false,
  offBoard = false,
}: {
  type?: MarbleType
  mark?: string
  empty?: boolean
  locked?: boolean
  offBoard?: boolean
}) {
  const label = mark ?? (type ? MARBLE_MARKS[type] : '')
  return (
    <svg
      className={`rule-hex ${type ? `marble-${type}` : ''} ${empty ? 'is-empty' : ''} ${
        locked ? 'is-locked' : ''
      } ${offBoard ? 'is-off-board' : ''}`}
      viewBox="-24 -24 48 48"
      aria-hidden="true"
    >
      <polygon points={hexPoints(21)} />
      {label && (
        <text textAnchor="middle" dominantBaseline="central">
          {label}
        </text>
      )}
    </svg>
  )
}

function GuideToken({
  type,
  count,
  showCount = true,
  state,
  warnOdd = false,
}: {
  type: MarbleType
  count: number
  showCount?: boolean
  state?: 'completed' | 'current' | 'future'
  warnOdd?: boolean
}) {
  const mark = MARBLE_MARKS[type]
  return (
    <svg
      className={`token marble-${type} ${state ? `is-${state}` : ''}`}
      viewBox="-24 -24 48 48"
      role="img"
      aria-label={`${count} ${MARBLE_LABELS[type]} remaining`}
    >
      <polygon points={hexPoints(20)} />
      {mark && (
        <text className="token-mark" textAnchor="middle" dominantBaseline="central">
          {mark}
        </text>
      )}
      {showCount && (
        <g className={`token-count-badge ${warnOdd && count % 2 === 1 ? 'is-odd' : ''}`}>
          <circle cx="15" cy="-13" r="8.8" />
          <text className="token-count" x="15" y="-13" textAnchor="middle" dominantBaseline="central">
            {count}
          </text>
        </g>
      )}
    </svg>
  )
}

type RulePosition = 'northWest' | 'northEast' | 'west' | 'center' | 'east' | 'southWest' | 'southEast'

const RULE_POSITIONS: RulePosition[] = ['northWest', 'northEast', 'west', 'center', 'east', 'southWest', 'southEast']
const MINI_HEX_SIZE = 24
const MINI_BOARD_WIDTH = MINI_HEX_SIZE * Math.sqrt(3) * 3 + 28
const MINI_BOARD_HEIGHT = MINI_HEX_SIZE * 3.5 + 28
const RULE_COORDS: Record<RulePosition, { q: number; r: number }> = {
  northWest: { q: 0, r: -1 },
  northEast: { q: 1, r: -1 },
  west: { q: -1, r: 0 },
  center: { q: 0, r: 0 },
  east: { q: 1, r: 0 },
  southWest: { q: -1, r: 1 },
  southEast: { q: 0, r: 1 },
}

type MiniTile = {
  position: RulePosition
  type?: MarbleType
  mark?: string
  selected?: boolean
  matchCandidate?: boolean
  locked?: boolean
  offBoard?: boolean
}

function miniPoint(position: RulePosition) {
  const { q, r } = RULE_COORDS[position]
  return {
    x: MINI_BOARD_WIDTH / 2 + MINI_HEX_SIZE * Math.sqrt(3) * (q + r / 2),
    y: MINI_BOARD_HEIGHT / 2 + MINI_HEX_SIZE * 1.5 * r,
  }
}

function MiniRuleBoard({ tiles }: { tiles: MiniTile[] }) {
  const tileByPosition = new Map(tiles.map((tile) => [tile.position, tile]))
  return (
    <svg className="mini-rule-board" viewBox={`0 0 ${MINI_BOARD_WIDTH} ${MINI_BOARD_HEIGHT}`} aria-hidden="true">
      <g className="grid">
        {RULE_POSITIONS.map((position) => {
          const point = miniPoint(position)
          return (
            <polygon
              key={position}
              points={hexPoints(MINI_HEX_SIZE - 2)}
              transform={`translate(${point.x} ${point.y})`}
            />
          )
        })}
      </g>
      <g className="mini-off-board-markers">
        {tiles
          .filter((tile) => tile.offBoard)
          .map((tile) => {
            const point = miniPoint(tile.position)
            return (
              <g key={`${tile.position}-off`} className="mini-off-board" transform={`translate(${point.x} ${point.y})`}>
                <polygon points={hexPoints(MINI_HEX_SIZE - 1)} />
                {tile.mark && (
                  <text aria-hidden="true" textAnchor="middle" dominantBaseline="central">
                    {tile.mark}
                  </text>
                )}
              </g>
            )
          })}
      </g>
      <g className="marbles">
        {RULE_POSITIONS.map((position) => {
          const tile = tileByPosition.get(position)
          if (!tile?.type) {
            return null
          }

          const point = miniPoint(position)
          const mark = tile.mark ?? MARBLE_MARKS[tile.type]
          return (
            <g
              key={position}
              className={`marble marble-${tile.type} is-free ${tile.selected ? 'is-selected' : ''} ${
                tile.matchCandidate ? 'is-match-candidate' : ''
              } ${tile.locked ? 'is-locked' : ''}`}
              transform={`translate(${point.x} ${point.y})`}
            >
              {tile.matchCandidate && <polygon className="match-pulse" points={hexPoints(MINI_HEX_SIZE - 1)} />}
              <polygon className="marble-face" points={hexPoints(MINI_HEX_SIZE - 5)} />
              {mark && (
                <text aria-hidden="true" textAnchor="middle" dominantBaseline="central">
                  {mark}
                </text>
              )}
            </g>
          )
        })}
      </g>
      <g className="mini-board-labels">
        {tiles
          .filter((tile) => tile.mark && !tile.type && !tile.offBoard)
          .map((tile) => {
            const point = miniPoint(tile.position)
            return (
              <text key={`${tile.position}-mark`} x={point.x} y={point.y} textAnchor="middle" dominantBaseline="central">
                {tile.mark}
              </text>
            )
          })}
      </g>
    </svg>
  )
}

function MatchPair({ types }: { types: [MarbleType, MarbleType] }) {
  return (
    <span className="match-pair">
      <RuleHex type={types[0]} />
      <span>+</span>
      <RuleHex type={types[1]} />
    </span>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
  const elementTypes: MarbleType[] = ['fire', 'air', 'earth', 'water']
  const metalTypes: MarbleType[] = ['lead', 'tin', 'iron', 'copper', 'silver']

  return (
    <div className="rules-backdrop" role="presentation" onClick={onClose}>
      <section
        className="rules-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="rules-close" type="button" aria-label="Close rules" onClick={onClose}>
          ×
        </button>

        <div className="rules-top">
          <section className="rules-block">
            <h2 id="rules-title">Clearing Tiles</h2>
            <div className="rules-cards one-up">
              <article>
                <MiniRuleBoard
                  tiles={[
                    { position: 'center', type: 'water', selected: true },
                    { position: 'east', type: 'water', matchCandidate: true },
                  ]}
                />
              </article>
            </div>
            <p>Your goal is to clear the board.</p>
            <p>Select a free tile, and then pick a matching tile to remove them both.</p>
          </section>

          <section className="rules-block">
            <h2>Unlocking Tiles</h2>
            <div className="rules-cards two-up">
              <article>
                <MiniRuleBoard
                  tiles={[
                    { position: 'northWest', type: 'fire' },
                    { position: 'northEast', type: 'fire' },
                    { position: 'west', type: 'fire' },
                    { position: 'center', type: 'water', locked: true },
                    { position: 'east', type: 'fire' },
                    { position: 'southWest', type: 'fire' },
                    { position: 'southEast', type: 'fire' },
                  ]}
                />
              </article>
              <article>
                <MiniRuleBoard
                  tiles={[
                    { position: 'northWest', type: 'fire' },
                    { position: 'northEast', mark: '1' },
                    { position: 'west', type: 'fire' },
                    { position: 'center', type: 'water' },
                    { position: 'east', mark: '2' },
                    { position: 'southWest', type: 'fire' },
                    { position: 'southEast', mark: '3' },
                  ]}
                />
              </article>
            </div>
            <p>
              A tile is only free if it has <strong>3 contiguous</strong> empty spaces next to it. Spaces off the
              board count as empty spaces.
            </p>
          </section>
        </div>

        <section className="rules-combinations">
          <h2>Matching Combinations</h2>
          <div className="combination-grid">
            <article>
              <div className="combo-row">
                {elementTypes.map((type) => (
                  <MatchPair key={type} types={[type, type]} />
                ))}
              </div>
              <p>The primary colors match with other tiles of the same color.</p>
            </article>

            <article>
              <div className="combo-row">
                {elementTypes.map((type) => (
                  <MatchPair key={type} types={[type, 'salt']} />
                ))}
                <MatchPair types={['salt', 'salt']} />
              </div>
              <p>Rainbow matches with any primary color or with itself.</p>
            </article>

            <article>
              <div className="combo-row">
                <MatchPair types={['vitae', 'mors']} />
              </div>
              <p>+ and − only match with each other.</p>
            </article>

            <article>
              <div className="metal-chain" aria-hidden="true">
                {metalTypes.map((type) => (
                  <Fragment key={type}>
                    <span className="metal-step">
                      <RuleHex type={type} />
                      <span>+</span>
                      <RuleHex type="quicksilver" />
                    </span>
                    <span className="chain-arrow">&gt;</span>
                  </Fragment>
                ))}
                <RuleHex type="gold" />
              </div>
              <p>The purple numbers match with ● in descending order. 0 clears alone.</p>
            </article>
          </div>
        </section>
      </section>
    </div>
  )
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
  const countsByType = new Map<MarbleType, number>()
  for (const marble of marbles) {
    countsByType.set(marble.type, (countsByType.get(marble.type) ?? 0) + 1)
  }
  const countFor = (type: MarbleType) => countsByType.get(type) ?? 0

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

  useEffect(() => {
    if (!rulesOpen) {
      return undefined
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRulesOpen(false)
      }
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [rulesOpen])

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

  function clearSelection() {
    if (!game?.selectedIds.length || game.finishedAt) {
      return
    }

    setGame((current) =>
      current
        ? {
            ...current,
            selectedIds: [],
            message: 'Selection cleared.',
          }
        : current,
    )
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
                  ? 'That tile is still blocked.'
                  : `${MARBLE_LABELS[marble.type]} is locked for now.`,
            }
          : current,
      )
      return
    }

    if (isSingleMatch(marble.type, game.metalIndex)) {
      playMatchSound()
      removeMarbles([marble.id])
      return
    }

    if (game.selectedIds.includes(marble.id)) {
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

  const currentPurple = getUnlockedMetal(game.metalIndex)
  const purpleStateFor = (index: number) => {
    if (index < game.metalIndex) {
      return 'completed' as const
    }

    return METAL_ORDER[index] === currentPurple ? 'current' as const : 'future' as const
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
          <button type="button" onClick={() => void newGame()}>
            New
          </button>
        </div>
      </header>

      <section className="board-wrap" aria-label="Puzzle board">
        <svg
          className="board"
          viewBox={`0 0 ${boardMetrics.width} ${boardMetrics.height}`}
          role="img"
          aria-label="Hexagonal puzzle board"
          onClick={(event) => {
            if (event.target instanceof Element && !event.target.closest('.marble')) {
              clearSelection()
            }
          }}
        >
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
              const matchCandidate =
                selectedMarbles.length === 1 &&
                !selected &&
                free &&
                isPairMatch(selectedMarbles[0].type, marble.type, game.metalIndex)
              const mark = MARBLE_MARKS[marble.type]
              return (
                <g
                  key={marble.id}
                  className={`marble marble-${marble.type} ${free ? 'is-free' : 'is-locked'} ${
                    selected ? 'is-selected' : ''
                  } ${matchCandidate ? 'is-match-candidate' : ''
                  }`}
                  transform={`translate(${point.x} ${point.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${MARBLE_LABELS[marble.type]} ${free ? 'free' : 'locked'}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    selectMarble(marble)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectMarble(marble)
                    }
                  }}
                >
                  {matchCandidate && <polygon className="match-pulse" points={hexPoints(HEX_SIZE - 1)} />}
                  <polygon className="marble-face" points={hexPoints(HEX_SIZE - 5)} />
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

      <section className="tray" aria-label="Remaining tiles">
        <div className="tray-row" aria-label="General matching inventory">
          {INVENTORY_GUIDE_TYPES.map((type) => (
            <Fragment key={type}>
              {type === 'vitae' && <span className="tray-divider" aria-hidden="true" />}
              <GuideToken type={type} count={countFor(type)} warnOdd={type === 'salt' || !MARBLE_MARKS[type]} />
            </Fragment>
          ))}
        </div>
        <div className="tray-row purple-track" aria-label="Purple progression">
          <GuideToken type="quicksilver" count={countFor('quicksilver')} />
          <span className="tray-divider" aria-hidden="true" />
          {METAL_ORDER.map((type, index) => (
            <Fragment key={type}>
              <GuideToken type={type} count={countFor(type)} showCount={false} state={purpleStateFor(index)} />
              {index < METAL_ORDER.length - 1 && <span className="tray-arrow" aria-hidden="true">&gt;</span>}
            </Fragment>
          ))}
        </div>
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

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </main>
  )
}

export default App
