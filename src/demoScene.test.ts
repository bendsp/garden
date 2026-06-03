import { describe, expect, it } from 'vitest'
import { type DemoScene, getDemoSceneDuration, getDemoStateAt } from './demoScene'

describe('demo scene runner', () => {
  it('sums timed steps when no explicit duration is set', () => {
    const scene: DemoScene = {
      tiles: [{ id: 'a', position: 'west', type: 'water' }],
      steps: [
        { kind: 'hold', ms: 100 },
        { kind: 'cursorTo', tileId: 'a', ms: 200 },
        { kind: 'press', tileId: 'a', ms: 50 },
        { kind: 'clear', tileIds: ['a'], ms: 300 },
        { kind: 'cursorFadeOut', ms: 100 },
      ],
    }

    expect(getDemoSceneDuration(scene)).toBe(750)
  })

  it('marks tiles as clearing during a clear step and hidden after it completes', () => {
    const scene: DemoScene = {
      tiles: [{ id: 'a', position: 'west', type: 'water' }],
      steps: [
        { kind: 'hold', ms: 100 },
        { kind: 'clear', tileIds: ['a'], ms: 300 },
        { kind: 'hold', ms: 100 },
      ],
    }

    expect(getDemoStateAt(scene, 150).tiles[0]).toMatchObject({ clearing: true })
    expect(getDemoStateAt(scene, 420).tiles[0]).toMatchObject({ clearing: false, hidden: true })
  })

  it('applies instantaneous selection and candidate commands', () => {
    const scene: DemoScene = {
      tiles: [
        { id: 'left', position: 'west', type: 'fire' },
        { id: 'right', position: 'east', type: 'fire' },
      ],
      steps: [
        { kind: 'select', tileId: 'left' },
        { kind: 'candidate', tileIds: ['right'] },
        { kind: 'hold', ms: 1000 },
      ],
    }

    const state = getDemoStateAt(scene, 10)

    expect(state.tiles.find((tile) => tile.id === 'left')).toMatchObject({ selected: true })
    expect(state.tiles.find((tile) => tile.id === 'right')).toMatchObject({ matchCandidate: true })
  })

  it('interpolates cursor movement between tile positions', () => {
    const scene: DemoScene = {
      tiles: [
        { id: 'left', position: 'west', type: 'fire' },
        { id: 'right', position: 'east', type: 'fire' },
      ],
      steps: [
        { kind: 'cursorTo', tileId: 'left', ms: 100 },
        { kind: 'cursorTo', tileId: 'right', ms: 100 },
      ],
    }

    expect(getDemoStateAt(scene, 150).cursor).toMatchObject({
      visible: true,
      fromPosition: 'west',
      toPosition: 'east',
      progress: 0.5,
    })
  })

  it('fades cursors in on first move and out on command', () => {
    const scene: DemoScene = {
      tiles: [{ id: 'a', position: 'west', type: 'fire' }],
      steps: [
        { kind: 'cursorTo', tileId: 'a', ms: 200 },
        { kind: 'cursorFadeOut', ms: 200 },
      ],
    }

    expect(getDemoStateAt(scene, 90).cursor?.opacity).toBe(0.5)
    expect(getDemoStateAt(scene, 300).cursor?.opacity).toBe(0.5)
    expect(getDemoStateAt(scene, 399).cursor?.opacity).toBeLessThan(0.01)
  })

  it('resets scene tiles after a reset command', () => {
    const scene: DemoScene = {
      tiles: [{ id: 'a', position: 'west', type: 'water', locked: true }],
      steps: [
        { kind: 'lock', tileIds: ['a'], locked: false },
        { kind: 'reset' },
        { kind: 'hold', ms: 1000 },
      ],
    }

    expect(getDemoStateAt(scene, 10).tiles[0]).toMatchObject({ locked: true })
  })
})
