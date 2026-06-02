# Garden Solitaire Rules

This project implements a minimalist browser game inspired by Sigmar's Garden, the solitaire minigame in Opus Magnum. It does not include original images, sounds, names, or bundled board data.

## Board Geometry

The board is a radius-5 hex grid with 91 cells.

Use axial coordinates:

```ts
cells = { (q, r) | max(abs(q), abs(r), abs(q + r)) <= 5 }
```

The visible row lengths are:

```text
6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6
```

The six neighbor directions, in circular order, are:

```ts
[
  [+1,  0],
  [+1, -1],
  [ 0, -1],
  [-1,  0],
  [-1, +1],
  [ 0, +1],
]
```

## Starting Marble Set

Each board starts with 55 marbles and 36 empty cells.

Canonical counts:

```text
8 Air
8 Fire
8 Water
8 Earth
4 Salt
4 Vitae
4 Mors
5 Quicksilver
1 Lead
1 Tin
1 Iron
1 Copper
1 Silver
1 Gold
```

This implementation renders these as flat colored hexagons. Metals are labeled `1` through `6`:

```text
1 Lead
2 Tin
3 Iron
4 Copper
5 Silver
6 Gold
```

## Free Marble Rule

A marble is playable only if it is free.

A marble is free when at least three contiguous neighbor positions around it are empty. The six neighbor positions are evaluated cyclically, so directions `4, 5, 0` count as contiguous.

Empty means either:

1. An in-board cell with no marble.
2. A position outside the 91-cell board.

This is stricter than "three empty neighbors anywhere." The empty positions must form an adjacent run around the marble.

Reference implementation:

```ts
function isFree(board, marble) {
  const empty = directions.map(([dq, dr]) =>
    outsideBoard(marble.q + dq, marble.r + dr) ||
    !board[cellKey(marble.q + dq, marble.r + dr)]
  )

  return [0, 1, 2, 3, 4, 5].some((i) =>
    empty[i] && empty[(i + 1) % 6] && empty[(i + 2) % 6]
  )
}
```

## Legal Moves

The goal is to clear every marble from the board.

A normal move removes two free marbles that form a valid pair. Both marbles must be free at the time of selection.

Gold is the only single-marble move. It can be removed by itself, but only after it is unlocked through the metal sequence.

## Matching Rules

Cardinal elements match only themselves:

```text
Air + Air
Fire + Fire
Water + Water
Earth + Earth
```

Salt matches any cardinal element or itself:

```text
Salt + Air
Salt + Fire
Salt + Water
Salt + Earth
Salt + Salt
```

Vitae and Mors match only each other:

```text
Vitae + Mors
```

Metals match Quicksilver, but only in transmutation order:

```text
Lead   + Quicksilver
Tin    + Quicksilver
Iron   + Quicksilver
Copper + Quicksilver
Silver + Quicksilver
Gold alone
```

## Metal Unlock State

The metal state starts at Lead.

Only the current metal is selectable. Later metals are locked even if physically free. Quicksilver may only form a metal pair with the currently unlocked metal.

After removing the current metal with Quicksilver, unlock the next metal:

```text
Lead -> Tin -> Iron -> Copper -> Silver -> Gold
```

After `Silver + Quicksilver`, Gold becomes unlocked. Gold is removed alone when free.

## Win And Stuck States

Win condition:

```text
board has 0 marbles
```

Stuck state:

```text
board has marbles, but legalMoves(board, metalState).length === 0
```

The official game uses solvable starting boards, but the player can still make choices that lead to a stuck position.

## Board Generation

Do not fill random cells with the marble multiset and assume the board is playable. Random boards are often unsolvable.

This implementation supports two sources:

1. Local board data loaded from `public/boards/solitaire.dat`, if the user copies their own installed Opus Magnum data file there.
2. A built-in constructive generator when local board data is absent.

The constructive generator builds a clearing sequence first, then places moves in reverse order. Each reverse placement is checked so the marble or pair would be free when removed during forward play. This guarantees at least one solution path.

The generated move bag contains exactly 28 removals:

```text
16 cardinal pairs
2 Salt + Salt pairs
4 Vitae + Mors pairs
5 Metal + Quicksilver pairs
1 Gold single
```

Total removed marbles:

```text
16 * 2 + 2 * 2 + 4 * 2 + 5 * 2 + 1 = 55
```

## Optional Local `solitaire.dat`

The original Opus Magnum install includes a `solitaire.dat` file with precomputed boards. That file is a game asset and must not be committed to this public repo.

For local use only:

```bash
npm run use:opus-data
```

That copies the file from the default macOS Steam install path into:

```text
public/boards/solitaire.dat
```

The repo ignores `public/boards/*.dat`.

Observed format:

```text
uint32 little-endian boardCount
boardCount * 55 records
each record: uint8 type, int8 x, int8 y
```

Coordinate conversion:

```ts
q = x - 5
r = y
```

The app also applies a random axial rotation for variety.

Observed type mapping:

```text
1  Salt
2  Air
3  Fire
4  Water
5  Earth
6  Quicksilver
7  Lead
8  Tin
9  Iron
10 Copper
11 Silver
12 Gold
13 Vitae
14 Mors
```

## Required Tests For Future Changes

Future agents should preserve tests for:

1. The board has exactly 91 cells.
2. A new board has exactly 55 marbles.
3. Starting counts match the canonical marble set.
4. `isFree` requires three contiguous empty neighbor spaces.
5. Off-board neighbor positions count as empty.
6. Pair matching follows the table above.
7. Later metals are locked until the current metal is removed with Quicksilver.
8. Gold is a single-marble move only after Silver has been removed with Quicksilver.
9. Generated boards have a replayable clearing solution.
10. Optional `.dat` parsing validates size, coordinates, and counts without bundling proprietary data.
