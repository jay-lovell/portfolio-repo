# Contributing

## Repository structure

```
crossword/       — Crossword helper app (HTML/CSS/JS, Firebase backend)
presc/weight/    — Weight calculator app (SCSS-based)
images/          — Site images
openspec/        — OpenSpec configuration
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run build:sass` | Compile SCSS → CSS for the weight calculator |
| `npm run watch:sass` | Watch-mode SCSS compilation |
| `npm run check` | Syntax-check crossword JS with `node --check` |

## Workflow tips

- **Scope PRs tightly** — one logical feature or fix per branch. Smaller PRs get reviewed faster and are easier to revert.
- **Describe the change area upfront** when using Copilot (e.g. "focus on `loadEntries` and `renderClues` in `crossword/main.js`") to reduce exploration time.
- **Run `npm run check`** before committing JavaScript changes.
- **Run `npm run build:sass`** before committing SCSS changes to verify compilation.

## Crossword data model

Entries are stored in Firestore (`crosswordClues` collection) with:

- `clue` — the clue text
- `answer` — uppercase letters only (e.g. `HELLOWORLD`)
- `answerPattern` — comma-separated word lengths (e.g. `5,5`)
- `letterCount` — total letter count
