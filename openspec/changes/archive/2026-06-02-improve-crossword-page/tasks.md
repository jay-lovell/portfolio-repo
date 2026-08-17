## 1. Route and Page Structure

- [x] 1.1 Create a dedicated add-entry screen and move add-word form UI from the main crossword page.
- [x] 1.2 Update navigation so users can move between solve/filter screen and add-entry screen without losing context.
- [x] 1.3 Keep status/error messaging available on both screens for create/edit/delete outcomes.

## 2. Entry Lifecycle and Data Flows

- [x] 2.1 Extend Firestore integration in crossword/main.js to support entry update operations.
- [x] 2.2 Extend Firestore integration in crossword/main.js to support hard delete operations with explicit user confirmation.
- [x] 2.3 Implement validation and user feedback handling for create/edit/delete success and failure paths.

## 3. Grid-First Filtering Input

- [x] 3.1 Replace current known-letter input interaction with crossword-grid-style letter boxes that support continuous typing across positions.
- [x] 3.2 Implement keyboard behavior for backspace and forward movement so users do not need to manually focus each box.
- [x] 3.3 Treat space input as a wildcard for that position during filtering and preserve deterministic filtering behavior.

## 4. Discovery Results and Clue Presentation

- [x] 4.1 Update clue results rendering so each result clearly shows both clue text and associated answer word.
- [x] 4.2 Ensure active filters (length, letter positions, wildcard spaces, optional clue text if retained) are applied through one derived pipeline.
- [x] 4.3 Ensure no-results and result-count messages remain accurate for all filter combinations.

## 5. Responsive and Older-User Accessibility

- [x] 5.1 Update crossword/styles.css so controls and results remain usable on narrow viewports without clipping or dense crowding.
- [x] 5.2 Increase readability and tap-target friendliness (font sizing, spacing, control sizes) for older non-technical mobile users.
- [x] 5.3 Verify keyboard focus visibility and ARIA/live-region updates for filter and mutation workflows.

## 6. Implementation Verification

- [x] 6.1 Manually test add/edit/delete flows, including confirmation and failure handling for hard delete.
- [x] 6.2 Manually test continuous typing behavior and wildcard-space filtering across multiple word lengths.
- [x] 6.3 Run desktop and mobile smoke checks for solve/filter page and add-entry page, then record follow-up fixes.
