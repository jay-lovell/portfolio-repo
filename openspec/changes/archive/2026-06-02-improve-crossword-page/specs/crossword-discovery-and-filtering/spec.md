## ADDED Requirements

#### Scenario: Search narrows visible entries
- **WHEN** a user enters search text in the clue search input
- **THEN** the system shows only entries whose clue text matches the search text and updates the result count/status message

#### Scenario: Empty search restores non-search filters
- **WHEN** a user clears the clue search input
- **THEN** the system reverts to showing entries filtered only by the active length and known-letter filters

### Requirement: Filters combine deterministically
The system SHALL apply length filtering, and known-letter position filtering as a combined filter set to produce a single deterministic result list.

#### Scenario: Multiple filters are active
- **WHEN** a user sets a letter count, enters known letters, and provides clue search text
- **THEN** the system displays only entries satisfying all active filters

#### Scenario: Filters produce no results
- **WHEN** active filters exclude all entries
- **THEN** the system shows an explicit no-results status message and an empty list view
