## Context

The crossword helper currently supports adding clues, loading all entries from Firestore, and filtering by answer length plus known letter positions. It does not support entry correction/deletion, clue text search, or explicit responsive/accessibility guarantees. Because crossword solving is iterative, users need reliable mutation flows and faster discovery controls to keep the dataset useful over time.

Constraints:
- Keep implementation within the current static-site architecture (`crossword/index.html`, `crossword/main.js`, `crossword/styles.css`).
- Continue using Firebase Firestore client SDK already in use on the page.
- Preserve simple no-build deployment model (plain HTML/CSS/JS).

## Goals / Non-Goals

**Goals:**
- Add full entry lifecycle support (create, edit, delete) with clear user feedback.
- Add clue text search alongside existing length/pattern filtering.
- Keep filtering reactive with low-latency updates in the existing single-page interaction model.
- Improve accessibility and mobile usability of controls and results.
- Seperate the add a word form to a different screen / page
- the primary focus of the UI should be the crossword grid styled user input and letter number entry mechanism
- the clue list must also clearly display the words that are associated with those clues
- typing in the user input must be continuous with no need for the user to seperately select the different letter boxes
- a space in a letter box means, for filtering purposes, "any letter in this position"

**Non-Goals:**
- Adding authentication/authorization for clue ownership.
- Migrating away from Firestore or introducing a backend service.
- Redesigning the entire portfolio theme outside the crossword page.

## Decisions

1. Keep Firestore as the source of truth and add update/delete operations in place.
Rationale: Existing data model and client initialization are already in place; extending CRUD avoids schema migration and keeps risk low.
Alternatives considered:
- Local-only state: rejected because persistence across sessions is required.
- New backend API: rejected as unnecessary complexity for this scoped page.

2. Introduce a single derived-filter pipeline that combines length filter, and known-letter pattern matching.
Rationale: A unified filter function reduces edge cases from independent filtering logic and keeps status messages consistent with visible results.
Alternatives considered:
- Sequential ad-hoc DOM filtering: rejected due to brittle behavior and higher maintenance cost.

3. Use inline edit mode per list item instead of a separate edit screen/modal.
Rationale: Crossword entries are short; inline editing lowers interaction cost and works well on desktop and mobile without routing complexity.
Alternatives considered:
- Modal editor: rejected because focus management and mobile viewport behavior add complexity.

4. Strengthen semantic markup and ARIA/live-region messages while preserving current structure.
Rationale: The page already includes status regions; extending these patterns provides accessibility gains without full rewrite.
Alternatives considered:
- Full component rewrite: rejected as out of scope.

## Risks / Trade-offs

- [Risk] Edit/delete operations can drift from in-memory state if optimistic updates fail. → Mitigation: Re-fetch entries after successful mutations and show explicit error messaging on failure.
- [Risk] More controls (search + pattern + actions) can increase UI density on small screens. → Mitigation: Use responsive stacking and clear spacing priorities in CSS.
- [Risk] Additional Firestore operations increase network dependency. → Mitigation: Keep failure states visible and non-destructive (do not clear user inputs on failure).
- [Risk] Inline editing could introduce accidental changes. → Mitigation: Require explicit save/cancel controls and validation parity with create flow.

## Migration Plan

1. Add new UI controls and action affordances in crossword markup.
2. Extend data access layer in `main.js` with update/delete Firestore calls.
3. Refactor render/filter flow into a single deterministic pipeline.
4. Add responsive and accessibility-focused style updates.
5. Verify manual smoke flows: add, edit, delete, search/filter combinations, empty/error states.

Rollback strategy:
- Revert changed crossword files to previous version; Firestore entries remain compatible since schema changes are additive and backward-compatible.

## Open Questions

- Should deletion be hard delete only, or should a soft-delete/tombstone pattern be added later? -- delete, confirmation (are you sure?), then hard delete
- Do we want a max result cap or virtualized rendering if the clue set grows substantially? No need for max result cap as it is not envisaged this will hold a huge amount of data
