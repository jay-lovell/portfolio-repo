## Purpose

Define usability and accessibility expectations for the crossword pages, especially on mobile and for older users.

## Requirements

### Requirement: Crossword controls remain usable on small screens
The system SHALL present crossword form fields, filters, and results in a responsive layout that remains operable on mobile viewport widths.

#### Scenario: Mobile viewport layout
- **WHEN** the crossword page is viewed on a narrow viewport
- **THEN** controls stack without overlap or horizontal clipping, and key actions remain visible without custom zooming

### Requirement: User feedback is communicated accessibly
The system SHALL provide status and error messages for create/edit/delete/filter actions through visible text and live-region-compatible updates.

#### Scenario: Mutation action feedback
- **WHEN** a create, update, or delete action succeeds or fails
- **THEN** the system updates a status/error region with concise feedback describing the outcome

#### Scenario: Filter feedback updates
- **WHEN** filter criteria change the visible result set
- **THEN** the system updates status text to reflect current result availability or count

### Requirement: User accessiblity for non-tech savvy, older users
The system SHALL be clear and usable for an older user using the system on a mobile device and element size, language, and screen clutter will all reflect this.

#### Scenario: Older mobile user completes filtering without assistance
- **WHEN** an older, non-technical user opens the crossword page on a mobile device and applies letter-position filtering
- **THEN** the interface presents readable text, adequately sized controls, and low-clutter layout that allows successful filtering without extra guidance
