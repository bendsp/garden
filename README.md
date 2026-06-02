# Garden

A minimalist browser solitaire game inspired by Sigmar's Garden.

The app uses flat, code-native hexagons instead of original game assets. It is designed to work on desktop and phone viewports.

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

## Rules

The implementation-grade rules reference is in [RULES.md](./RULES.md). Keep that file and the tests aligned when changing game behavior.

## Board Data

By default, the app uses a constructive solvable-board generator.

If you own Opus Magnum locally and want to use your installed precomputed boards while playing on this machine:

```bash
npm run use:opus-data
```

This copies your local Steam install's `solitaire.dat` to:

```text
public/boards/solitaire.dat
```

That file is ignored by git and must not be committed to this public repo.

When `public/boards/solitaire.dat` is present, the app loads a random board from it. When it is absent, the app falls back to the built-in generator.
