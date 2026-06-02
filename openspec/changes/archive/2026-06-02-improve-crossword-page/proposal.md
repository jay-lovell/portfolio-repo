## Why

The current crossword helper works for basic clue storage and filtering, but it does not match the way people naturally fill crossword answers on mobile. Aligning the experience to a grid-first, continuous-typing workflow will make it faster, clearer, and more usable for regular puzzle solving.

## What Changes

- Add clue lifecycle actions so users can update and delete saved entries.
- Separate the add-word form into its own screen so the main page prioritizes solving and filtering.
- Make the primary interaction a crossword-grid-style letter entry mechanism with continuous typing across boxes.
- Treat a space in a letter box as a wildcard for that position when filtering answers.
- Ensure clue results clearly show both clue text and associated answer words.
- Improve crossword page accessibility and responsive behavior for small screens, including older non-technical users.

## Capabilities

### New Capabilities
- `crossword-entry-management`: Create, update, and delete crossword clue entries with validation and user feedback.
- `crossword-discovery-and-filtering`: Filter clues by length and known letter positions using crossword-grid-style continuous input, including wildcard spaces.
- `crossword-page-usability`: Responsive and accessible crossword page interactions, including clear clue-plus-answer display, dedicated add-entry flow, keyboard-friendly controls, and status messaging.

### Modified Capabilities
- None.

## Impact

- Affected code: `crossword/index.html`, `crossword/main.js`, and `crossword/styles.css`.
- Data behavior: Firestore reads/writes will include update and delete operations in addition to create/read.
- UI behavior: Grid-style input interactions, continuous typing behavior, wildcard handling, separate add-entry route/screen, and improved accessibility messaging.
- Risk areas: Data mutation flows, result rendering consistency, and mobile layout regressions.
