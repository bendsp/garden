# Garden

A minimalist browser solitaire game with a radius-5 hex board, symbolic marbles, and a compact first-party level pack.

The app uses flat, code-native SVG/CSS visuals. It is designed to work on desktop and phone viewports.

## Run

```bash
npm install
npm run dev
```

## Tests

```bash
npm run lint
npm run test
npm run build
```

## Levels

The app loads only the committed first-party level pack at:

```text
public/boards/levels.dat
```

This file is tracked in git. Normal dev, test, and build commands do not regenerate or overwrite it.

Only regenerate the pack when you intentionally want to replace the levels:

```bash
npm run generate:levels -- 100
```

The format is intentionally tiny:

```text
uint32 little-endian boardCount
boardCount * 55 records
each record: uint8 type, int8 x, int8 y
```

See [RULES.md](./RULES.md) for the complete rules, type-code mapping, and test expectations.
