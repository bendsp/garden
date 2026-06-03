import type { MarbleType } from './game'

export type RulePosition = 'northWest' | 'northEast' | 'west' | 'center' | 'east' | 'southWest' | 'southEast'

export const RULE_POSITIONS: RulePosition[] = ['northWest', 'northEast', 'west', 'center', 'east', 'southWest', 'southEast']

export const RULE_COORDS: Record<RulePosition, { q: number; r: number }> = {
  northWest: { q: 0, r: -1 },
  northEast: { q: 1, r: -1 },
  west: { q: -1, r: 0 },
  center: { q: 0, r: 0 },
  east: { q: 1, r: 0 },
  southWest: { q: -1, r: 1 },
  southEast: { q: 0, r: 1 },
}

export type DemoTile = {
  id: string
  position: RulePosition
  type?: MarbleType
  mark?: string
  selected?: boolean
  matchCandidate?: boolean
  locked?: boolean
  hidden?: boolean
  clearing?: boolean
  fading?: 'in' | 'out'
  offBoard?: boolean
}

export type DemoCursorState = {
  visible: boolean
  fromPosition?: RulePosition
  toPosition?: RulePosition
  progress: number
  pressing?: boolean
}

export type DemoRenderState = {
  tiles: DemoTile[]
  cursor?: DemoCursorState
}

export type DemoStep =
  | { kind: 'hold'; ms: number }
  | { kind: 'cursorTo'; tileId: string; ms: number }
  | { kind: 'press'; tileId: string; ms: number }
  | { kind: 'select'; tileId?: string }
  | { kind: 'candidate'; tileIds: string[] }
  | { kind: 'lock'; tileIds: string[]; locked: boolean }
  | { kind: 'clear'; tileIds: string[]; ms: number }
  | { kind: 'hide'; tileIds: string[]; hidden: boolean }
  | { kind: 'setTiles'; tiles: DemoTile[]; ms?: number }
  | { kind: 'reset' }

export type DemoScene = {
  tiles: DemoTile[]
  steps: DemoStep[]
  durationMs?: number
}

const DEFAULT_PRESS_MS = 180

function stepDuration(step: DemoStep) {
  switch (step.kind) {
    case 'hold':
    case 'cursorTo':
    case 'clear':
      return step.ms
    case 'press':
      return step.ms ?? DEFAULT_PRESS_MS
    case 'setTiles':
      return step.ms ?? 0
    default:
      return 0
  }
}

export function getDemoSceneDuration(scene: DemoScene) {
  return scene.durationMs ?? scene.steps.reduce((duration, step) => duration + stepDuration(step), 0)
}

function cloneTiles(tiles: DemoTile[]) {
  return tiles.map((tile) => ({ ...tile }))
}

function applyToTiles(tiles: DemoTile[], tileIds: string[], update: (tile: DemoTile) => DemoTile) {
  const ids = new Set(tileIds)
  return tiles.map((tile) => (ids.has(tile.id) ? update(tile) : tile))
}

function getTilePosition(tiles: DemoTile[], tileId: string) {
  return tiles.find((tile) => tile.id === tileId)?.position
}

function easeInOut(progress: number) {
  const clamped = Math.min(1, Math.max(0, progress))
  return clamped * clamped * (3 - 2 * clamped)
}

function visibleState(tiles: DemoTile[], cursor?: DemoCursorState): DemoRenderState {
  return {
    tiles: cloneTiles(tiles),
    cursor: cursor ? { ...cursor } : undefined,
  }
}

export function getDemoStateAt(scene: DemoScene, timeMs: number): DemoRenderState {
  const duration = Math.max(1, getDemoSceneDuration(scene))
  const localTime = ((timeMs % duration) + duration) % duration
  let elapsed = 0
  let tiles = cloneTiles(scene.tiles)
  let cursor: DemoCursorState | undefined

  for (const step of scene.steps) {
    const durationMs = stepDuration(step)
    const progressMs = localTime - elapsed

    if (durationMs > 0 && progressMs < durationMs) {
      switch (step.kind) {
        case 'hold':
          return visibleState(tiles, cursor)
        case 'cursorTo': {
          const toPosition = getTilePosition(tiles, step.tileId)
          if (!toPosition) {
            return visibleState(tiles, cursor)
          }
          const fromPosition = cursor?.toPosition ?? cursor?.fromPosition ?? toPosition
          return visibleState(tiles, {
            visible: true,
            fromPosition,
            toPosition,
            progress: easeInOut(progressMs / durationMs),
          })
        }
        case 'press': {
          const toPosition = getTilePosition(tiles, step.tileId)
          return visibleState(
            tiles,
            toPosition
              ? {
                  visible: true,
                  fromPosition: toPosition,
                  toPosition,
                  progress: 1,
                  pressing: true,
                }
              : cursor,
          )
        }
        case 'clear':
          return visibleState(
            applyToTiles(tiles, step.tileIds, (tile) => ({ ...tile, clearing: true, fading: 'out' })),
            cursor,
          )
        case 'setTiles':
          return visibleState(
            cloneTiles(step.tiles).map((tile) => ({ ...tile, fading: 'in' })),
            cursor,
          )
        default:
          return visibleState(tiles, cursor)
      }
    }

    if (durationMs > 0) {
      switch (step.kind) {
        case 'cursorTo': {
          const toPosition = getTilePosition(tiles, step.tileId)
          if (toPosition) {
            cursor = { visible: true, fromPosition: toPosition, toPosition, progress: 1 }
          }
          break
        }
        case 'press': {
          const toPosition = getTilePosition(tiles, step.tileId)
          if (toPosition) {
            cursor = { visible: true, fromPosition: toPosition, toPosition, progress: 1 }
          }
          break
        }
        case 'clear':
          tiles = applyToTiles(tiles, step.tileIds, (tile) => ({
            ...tile,
            hidden: true,
            clearing: false,
            selected: false,
            matchCandidate: false,
            fading: undefined,
          }))
          break
        case 'setTiles':
          tiles = cloneTiles(step.tiles)
          break
      }
    } else if (localTime >= elapsed) {
      switch (step.kind) {
        case 'select':
          tiles = tiles.map((tile) => ({ ...tile, selected: step.tileId ? tile.id === step.tileId : false }))
          break
        case 'candidate': {
          const ids = new Set(step.tileIds)
          tiles = tiles.map((tile) => ({ ...tile, matchCandidate: ids.has(tile.id) }))
          break
        }
        case 'lock':
          tiles = applyToTiles(tiles, step.tileIds, (tile) => ({ ...tile, locked: step.locked }))
          break
        case 'hide':
          tiles = applyToTiles(tiles, step.tileIds, (tile) => ({ ...tile, hidden: step.hidden }))
          break
        case 'setTiles':
          tiles = cloneTiles(step.tiles)
          break
        case 'reset':
          tiles = cloneTiles(scene.tiles)
          cursor = undefined
          break
      }
    }

    elapsed += durationMs
  }

  return visibleState(tiles, cursor)
}
