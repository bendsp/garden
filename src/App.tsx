import { Fragment, type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { playLossSound, playMatchSound, playSelectSound, playWinSound } from './audio'
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
  legalMoves,
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

let cachedLevelsBuffer: ArrayBuffer | null = null
let levelsBufferRequest: Promise<ArrayBuffer> | null = null

function readStoredNumber(key: string, fallback = 0) {
  const stored = localStorage.getItem(key)
  if (stored === null) {
    return fallback
  }
  const value = Number(stored)
  return Number.isFinite(value) ? value : fallback
}

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

function formatPercentage(wins: number, losses: number) {
  const total = wins + losses
  if (total === 0) {
    return '0%'
  }
  return `${Math.round((wins / total) * 100)}%`
}

function makeGame(buffer: ArrayBuffer) {
  return parseLevelsDat(buffer, Math.floor(Math.random() * 2 ** 32))
}

function activateGame(nextGame: GameState) {
  return {
    ...nextGame,
    selectedIds: [],
    history: [],
    startedAt: Date.now(),
    timerStartedAt: undefined,
    finishedAt: undefined,
  }
}

async function fetchLevelsBuffer() {
  if (cachedLevelsBuffer) {
    return cachedLevelsBuffer
  }

  levelsBufferRequest ??= fetch('/boards/levels.dat', { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Could not load level data.')
      }
      return response.arrayBuffer()
    })
    .then((buffer) => {
      cachedLevelsBuffer = buffer
      return buffer
    })
    .catch((error) => {
      levelsBufferRequest = null
      throw error
    })

  return levelsBufferRequest
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

function MiniRuleBoard({
  tiles,
  animatedClearing = false,
  animatedUnlocking = false,
}: {
  tiles: MiniTile[]
  animatedClearing?: boolean
  animatedUnlocking?: boolean
}) {
  const tileByPosition = new Map(tiles.map((tile) => [tile.position, tile]))
  const westPoint = miniPoint('west')
  const eastPoint = miniPoint('east')
  const centerPoint = miniPoint('center')
  return (
    <svg
      className={`mini-rule-board ${animatedClearing ? 'is-clearing-demo' : ''} ${
        animatedUnlocking ? 'is-unlocking-demo' : ''
      }`}
      viewBox={`0 0 ${MINI_BOARD_WIDTH} ${MINI_BOARD_HEIGHT}`}
      aria-hidden="true"
      style={{
        '--cursor-start-x': `${westPoint.x - 44}px`,
        '--cursor-start-y': `${westPoint.y + 28}px`,
        '--cursor-first-x': `${westPoint.x - 2}px`,
        '--cursor-first-y': `${westPoint.y + 5}px`,
        '--cursor-second-x': `${eastPoint.x - 2}px`,
        '--cursor-second-y': `${eastPoint.y + 5}px`,
        '--cursor-center-x': `${centerPoint.x - 2}px`,
        '--cursor-center-y': `${centerPoint.y + 5}px`,
      } as CSSProperties}
    >
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
              className={`marble position-${position} marble-${tile.type} is-free ${tile.selected ? 'is-selected' : ''} ${
                tile.matchCandidate ? 'is-match-candidate' : ''
              } ${tile.locked ? 'is-locked' : ''}`}
              transform={`translate(${point.x} ${point.y})`}
            >
              {(tile.matchCandidate || (animatedClearing && position === 'east')) && (
                <polygon className="match-pulse" points={hexPoints(MINI_HEX_SIZE - 1)} />
              )}
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
      {(animatedClearing || animatedUnlocking) && (
        <g className="demo-cursor">
          <path d="M0 0 0 24 6.5 18 10.5 28 16 25.7 11.8 16.1 20 16.1Z" />
        </g>
      )}
    </svg>
  )
}

function MatchingDemoBoard({
  pairs,
  contextTiles = [],
  className = '',
}: {
  pairs: Array<{ className: string; types: [MarbleType, MarbleType] }>
  contextTiles?: MiniTile[]
  className?: string
}) {
  const westPoint = miniPoint('west')
  const eastPoint = miniPoint('east')

  return (
    <svg
      className={`mini-rule-board match-demo-board ${className}`}
      viewBox={`0 0 ${MINI_BOARD_WIDTH} ${MINI_BOARD_HEIGHT}`}
      aria-hidden="true"
      style={{
        '--cursor-start-x': `${westPoint.x - 44}px`,
        '--cursor-start-y': `${westPoint.y + 28}px`,
        '--cursor-first-x': `${westPoint.x - 2}px`,
        '--cursor-first-y': `${westPoint.y + 5}px`,
        '--cursor-second-x': `${eastPoint.x - 2}px`,
        '--cursor-second-y': `${eastPoint.y + 5}px`,
      } as CSSProperties}
    >
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
      <g className="match-demo-context">
        {contextTiles.map((tile) => {
          const point = miniPoint(tile.position)
          const mark = tile.mark ?? (tile.type ? MARBLE_MARKS[tile.type] : undefined)
          return (
            <g
              key={`${tile.position}-${tile.type ?? tile.mark}`}
              className={`marble position-${tile.position} ${tile.type ? `marble-${tile.type}` : ''}`}
              transform={`translate(${point.x} ${point.y})`}
            >
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
      <g className="match-demo-pairs">
        {pairs.map((pair) => (
          <g key={pair.className} className={`match-demo-pair ${pair.className}`}>
            {(['west', 'east'] as const).map((position, index) => {
              const point = miniPoint(position)
              const type = pair.types[index]
              const mark = MARBLE_MARKS[type]
              return (
                <g
                  key={`${pair.className}-${position}`}
                  className={`marble position-${position} marble-${type} is-free ${
                    position === 'west' ? 'is-demo-selected' : 'is-demo-target'
                  }`}
                  transform={`translate(${point.x} ${point.y})`}
                >
                  {position === 'east' && <polygon className="match-pulse" points={hexPoints(MINI_HEX_SIZE - 1)} />}
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
        ))}
      </g>
      <g className="demo-cursor">
        <path d="M0 0 0 24 6.5 18 10.5 28 16 25.7 11.8 16.1 20 16.1Z" />
      </g>
    </svg>
  )
}

function ColorMatchDemoBoard() {
  const pairs: Array<{ className: string; types: [MarbleType, MarbleType] }> = [
    { className: 'is-red-pair', types: ['fire', 'fire'] },
    { className: 'is-blue-pair', types: ['water', 'water'] },
    { className: 'is-green-rainbow-pair', types: ['earth', 'salt'] },
    { className: 'is-rainbow-pair', types: ['salt', 'salt'] },
  ]

  return <MatchingDemoBoard pairs={pairs} className="color-match-demo-board" />
}

function PolarityMatchDemoBoard() {
  return (
    <MatchingDemoBoard
      pairs={[{ className: 'is-polarity-pair', types: ['vitae', 'mors'] }]}
      contextTiles={[
        { position: 'southWest', type: 'earth' },
        { position: 'northEast', type: 'air' },
      ]}
      className="polarity-match-demo-board"
    />
  )
}

function MiniDemoMarble({
  position,
  type,
  className = '',
  matchCandidate = false,
}: {
  position: RulePosition
  type: MarbleType
  className?: string
  matchCandidate?: boolean
}) {
  const point = miniPoint(position)
  const mark = MARBLE_MARKS[type]

  return (
    <g
      className={`marble position-${position} marble-${type} ${className}`}
      transform={`translate(${point.x} ${point.y})`}
    >
      {matchCandidate && <polygon className="match-pulse" points={hexPoints(MINI_HEX_SIZE - 1)} />}
      <polygon className="marble-face" points={hexPoints(MINI_HEX_SIZE - 5)} />
      {mark && (
        <text aria-hidden="true" textAnchor="middle" dominantBaseline="central">
          {mark}
        </text>
      )}
    </g>
  )
}

function cursorVars(first: RulePosition, second: RulePosition) {
  const firstPoint = miniPoint(first)
  const secondPoint = miniPoint(second)

  return {
    '--cursor-start-x': `${firstPoint.x - 44}px`,
    '--cursor-start-y': `${firstPoint.y + 28}px`,
    '--cursor-first-x': `${firstPoint.x - 2}px`,
    '--cursor-first-y': `${firstPoint.y + 5}px`,
    '--cursor-second-x': `${secondPoint.x - 2}px`,
    '--cursor-second-y': `${secondPoint.y + 5}px`,
  } as CSSProperties
}

function DemoCursor() {
  return (
    <g className="demo-cursor">
      <path d="M0 0 0 24 6.5 18 10.5 28 16 25.7 11.8 16.1 20 16.1Z" />
    </g>
  )
}

function PurpleMatchDemoBoard() {
  return (
    <svg
      className="mini-rule-board purple-match-demo-board"
      viewBox={`0 0 ${MINI_BOARD_WIDTH} ${MINI_BOARD_HEIGHT}`}
      aria-hidden="true"
    >
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

      <g className="purple-demo-static-dot-one">
        <MiniDemoMarble position="northWest" type="quicksilver" />
      </g>
      <g className="purple-demo-locked-one">
        <MiniDemoMarble position="southWest" type="silver" />
      </g>
      <g className="purple-demo-locked-zero">
        <MiniDemoMarble position="center" type="gold" />
      </g>

      <g className="purple-demo-stage purple-demo-stage-two" style={cursorVars('east', 'northEast')}>
        <MiniDemoMarble position="east" type="copper" className="is-demo-selected" />
        <MiniDemoMarble position="northEast" type="quicksilver" className="is-demo-target" matchCandidate />
        <DemoCursor />
      </g>

      <g className="purple-demo-stage purple-demo-stage-one" style={cursorVars('southWest', 'northWest')}>
        <MiniDemoMarble position="southWest" type="silver" className="is-demo-selected" />
        <MiniDemoMarble position="northWest" type="quicksilver" className="is-demo-target" matchCandidate />
        <DemoCursor />
      </g>

      <g className="purple-demo-stage purple-demo-stage-zero" style={cursorVars('center', 'center')}>
        <MiniDemoMarble position="center" type="gold" className="is-demo-selected" />
        <DemoCursor />
      </g>
    </svg>
  )
}

function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <div className={`brand ${className}`}>
      <svg className="brand-mark" viewBox="-13 -13 26 26" aria-hidden="true">
        <polygon points={hexPoints(11.5)} />
      </svg>
      <h1>Garden</h1>
    </div>
  )
}

function AppHeader({
  elapsed = '0:00',
  undoDisabled,
  onRules,
  onUndo,
  onNew,
  disabled = false,
}: {
  elapsed?: string
  undoDisabled: boolean
  onRules: () => void
  onUndo: () => void
  onNew: () => void
  disabled?: boolean
}) {
  return (
    <header className="topbar">
      <BrandLogo />
      <div className="topbar-timer" aria-label="Elapsed time">
        {elapsed}
      </div>
      <div className="actions" aria-label="Game controls">
        <button type="button" onClick={onRules} disabled={disabled}>
          Rules
        </button>
        <button type="button" onClick={onUndo} disabled={disabled || undoDisabled}>
          Undo
        </button>
        <button type="button" onClick={onNew} disabled={disabled}>
          New
        </button>
      </div>
    </header>
  )
}

function LoadingMessage({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <main className="app app-loading">
      <AppHeader
        undoDisabled
        disabled
        onRules={() => undefined}
        onUndo={() => undefined}
        onNew={onRetry}
      />
      <section className="loading-stage" aria-live="polite">
        {error ? (
          <div className="loading-copy">
            <p>{error}</p>
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : (
          <p className="loading-copy">
            Loading Garden
            <span className="loading-dots" aria-hidden="true">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
            <span className="sr-only">...</span>
          </p>
        )}
      </section>
    </main>
  )
}

function RulesModal({ onClose }: { onClose: () => void }) {
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

        <BrandLogo className="rules-brand" />

        <div className="rules-top">
          <section className="rules-block">
            <h2 id="rules-title">Clearing Tiles</h2>
            <div className="rules-cards one-up">
              <article>
                <MiniRuleBoard
                  animatedClearing
                  tiles={[
                    { position: 'west', type: 'water' },
                    { position: 'east', type: 'water' },
                  ]}
                />
              </article>
            </div>
            <p>
              Your goal is to <strong>clear the board</strong>.
            </p>
            <p>Select a free tile, and then pick a matching tile to remove them both.</p>
          </section>

          <section className="rules-block">
            <h2>Unlocking Tiles</h2>
            <div className="rules-cards one-up">
              <article>
                <MiniRuleBoard
                  animatedUnlocking
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
            <article className="color-match-demo">
              <div className="color-match-frame">
                <ColorMatchDemoBoard />
              </div>
              <div className="color-match-copy">
                <p>The basic tiles match with other tiles of the same color.</p>
                <p>
                  Rainbow matches with any basic tile <strong>or with itself</strong>.
                </p>
              </div>
            </article>

            <article className="polarity-match-demo">
              <div className="color-match-frame">
                <PolarityMatchDemoBoard />
              </div>
              <p>+ and − only match with each other.</p>
            </article>

            <article className="purple-match-demo">
              <div className="color-match-frame">
                <PurpleMatchDemoBoard />
              </div>
              <p>
                The purple numbers match with ● in <strong>descending order</strong>. 0 clears alone.
              </p>
            </article>
          </div>
        </section>
        <div className="rules-footer">
          <button type="button" onClick={onClose}>
            Got it
          </button>
        </div>
      </section>
    </div>
  )
}

function App() {
  const [game, setGame] = useState<GameState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [wins, setWins] = useState(() => readStoredNumber('garden:wins'))
  const [losses, setLosses] = useState(() => readStoredNumber('garden:losses'))
  const [bestTime, setBestTime] = useState(() => {
    const stored = readStoredNumber('garden:best-time', Number.POSITIVE_INFINITY)
    return Number.isFinite(stored) ? stored : undefined
  })
  const [countedWin, setCountedWin] = useState<string | null>(null)
  const [rulesOpen, setRulesOpen] = useState(true)
  const [lossOpen, setLossOpen] = useState(false)
  const [winOpen, setWinOpen] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const levelsBufferRef = useRef<ArrayBuffer | null>(null)
  const nextGameRef = useRef<GameState | null>(null)
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
  const hasNoLegalMoves = game
    ? !game.finishedAt && marbles.length > 0 && legalMoves(game.board, game.metalIndex).length === 0
    : false

  const primeNextGame = useCallback((buffer: ArrayBuffer) => {
    nextGameRef.current = makeGame(buffer)
  }, [])

  const scheduleNextGame = useCallback((buffer: ArrayBuffer) => {
    window.setTimeout(() => {
      if (!nextGameRef.current) {
        primeNextGame(buffer)
      }
    }, 0)
  }, [primeNextGame])

  const loadLevelsBuffer = useCallback(async () => {
    if (levelsBufferRef.current) {
      return levelsBufferRef.current
    }

    const buffer = await fetchLevelsBuffer()
    levelsBufferRef.current = buffer
    return buffer
  }, [])

  function recordAbandonedLoss(currentGame: GameState | null) {
    if (!currentGame?.timerStartedAt || currentGame.finishedAt) {
      return
    }

    setLosses((current) => {
      const next = current + 1
      localStorage.setItem('garden:losses', String(next))
      return next
    })
  }

  async function newGame() {
    try {
      const buffer = await loadLevelsBuffer()
      const preparedGame = nextGameRef.current ?? makeGame(buffer)
      recordAbandonedLoss(game)
      nextGameRef.current = null
      setGame(activateGame(preparedGame))
      setLossOpen(false)
      setWinOpen(true)
      scheduleNextGame(buffer)
      setCountedWin(null)
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load level data.')
    }
  }

  useEffect(() => {
    let cancelled = false

    loadLevelsBuffer()
      .then((buffer) => {
        if (!cancelled) {
          const initialGame = makeGame(buffer)
          setGame(activateGame(initialGame))
          setWinOpen(true)
          scheduleNextGame(buffer)
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
  }, [loadLevelsBuffer, scheduleNextGame])

  useEffect(() => {
    if (!rulesOpen && !(game?.finishedAt && winOpen)) {
      return undefined
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (game?.finishedAt && winOpen) {
          setWinOpen(false)
        } else {
          setRulesOpen(false)
        }
      }
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [game?.finishedAt, rulesOpen, winOpen])

  useEffect(() => {
    if (!game?.timerStartedAt || game.finishedAt || lossOpen) {
      return undefined
    }

    const interval = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(interval)
  }, [game?.timerStartedAt, game?.finishedAt, lossOpen])

  useEffect(() => {
    if (!hasNoLegalMoves) {
      return undefined
    }

    const timeout = window.setTimeout(() => {
      setNow(Date.now())
      setLossOpen(true)
      playLossSound()
    }, 1000)

    return () => window.clearTimeout(timeout)
  }, [hasNoLegalMoves])

  function recordWin(nextGame: GameState) {
    const finishedAt = nextGame.finishedAt
    const timerStartedAt = nextGame.timerStartedAt
    if (!finishedAt || !timerStartedAt) {
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
    setBestTime((current) => {
      const elapsed = finishedAt - timerStartedAt
      const next = current === undefined ? elapsed : Math.min(current, elapsed)
      localStorage.setItem('garden:best-time', String(next))
      return next
    })
  }

  function removeMarbles(ids: string[]) {
    if (!game) {
      return
    }

    const nextGame = applyRemoval(game, ids)
    if (nextGame.finishedAt) {
      playWinSound()
    } else if (legalMoves(nextGame.board, nextGame.metalIndex).length > 0) {
      playMatchSound()
      setLossOpen(false)
    }
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
    return <LoadingMessage error={loadError} onRetry={() => void newGame()} />
  }

  const currentPurple = getUnlockedMetal(game.metalIndex)
  const elapsedMs = game.timerStartedAt ? (game.finishedAt ?? now) - game.timerStartedAt : 0
  const winPercentage = formatPercentage(wins, losses)
  const purpleStateFor = (index: number) => {
    if (index < game.metalIndex) {
      return 'completed' as const
    }

    return METAL_ORDER[index] === currentPurple ? 'current' as const : 'future' as const
  }

  return (
    <main className="app">
      <AppHeader
        elapsed={formatTime(elapsedMs)}
        undoDisabled={!game.history.length}
        onRules={() => setRulesOpen((open) => !open)}
        onUndo={() => {
          setLossOpen(false)
          setGame((current) => (current ? undoGame(current) : current))
        }}
        onNew={() => void newGame()}
      />

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

      {game.finishedAt && winOpen && (
        <section className="result-backdrop" aria-label="Win result">
          <div className="result result-win" role="dialog" aria-modal="true" aria-labelledby="win-title">
            <button className="result-close" type="button" aria-label="Close result" onClick={() => setWinOpen(false)}>
              ×
            </button>
            <h2 id="win-title">Board cleared!</h2>
            <div className="result-stats" aria-label="Game statistics">
              <section className="result-stat-column" aria-labelledby="time-stats-title">
                <h3 id="time-stats-title">Time</h3>
                <p className="result-stat">
                  <span>Time</span>
                  <strong>{formatTime(elapsedMs)}</strong>
                </p>
                <p className="result-stat">
                  <span>Best time</span>
                  <strong>{bestTime === undefined ? '—' : formatTime(bestTime)}</strong>
                </p>
              </section>
              <section className="result-stat-column" aria-labelledby="win-stats-title">
                <h3 id="win-stats-title">Wins</h3>
                <p className="result-stat">
                  <span>Wins</span>
                  <strong>{wins}</strong>
                </p>
                <p className="result-stat">
                  <span>Win percentage</span>
                  <strong>{winPercentage}</strong>
                </p>
              </section>
            </div>
            <button type="button" onClick={() => void newGame()}>
              Play again
            </button>
          </div>
        </section>
      )}

      {lossOpen && (
        <section className="result-backdrop" aria-label="Loss result">
          <div className="result" role="dialog" aria-modal="true" aria-labelledby="loss-title">
            <h2 id="loss-title">No moves left</h2>
            <p>This board has no valid moves left.</p>
            <div className="result-actions">
              <button
                type="button"
                onClick={() => {
                  setLossOpen(false)
                  setGame((current) => (current ? undoGame(current) : current))
                }}
                disabled={!game.history.length}
              >
                Undo
              </button>
              <button type="button" onClick={() => void newGame()}>
                Play again
              </button>
            </div>
          </div>
        </section>
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </main>
  )
}

export default App
