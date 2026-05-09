# Production-Grade Plan

This plan turns the current extension into a more predictable, testable codebase with lower regression risk.

## Goals

- Reduce bugs caused by hidden coupling across components.
- Make roulette logic testable without the browser runtime.
- Add quality gates that fail fast before regressions ship.
- Clarify ownership boundaries between scraping, state normalization, domain logic, and UI rendering.

## Current Bottlenecks

1. Domain logic is still embedded in large components.
   `roulette-virtual-board.tsx` currently mixes rendering, session state, betting logic, timers, signal detection, and live-table side effects.

2. Runtime contracts are implicit.
   Ordering conventions such as newest-first vs oldest-first are carried in comments and assumptions instead of explicit helper functions and tests.

3. No automated test harness is configured.
   Bugs are currently caught late through manual sidepanel testing.

4. There is no standard change gate beyond building.
   This makes it easy to land behavior changes without contract verification.

## Phase 1: Immediate Quality Gates

Target: establish minimum guardrails without a large refactor.

1. Add package scripts:
   `typecheck`: `tsc --noEmit`
   `test`: test runner command once configured
   `check`: run build, typecheck, and tests

2. Introduce a unit test runner.
   Recommended:
   - `vitest`
   - `@testing-library/react`
   - `jsdom`

3. Add a CI workflow that blocks merges when `check` fails.

4. Require this rule:
   every new feature adds at least one automated test;
   every bug fix adds regression coverage unless explicitly waived.

## Phase 2: Extract Logic From Components

Target: shrink regression surface by moving logic into deterministic modules.

### Roulette priorities

1. Extract live spin ingestion helpers from `roulette-workspace.tsx`.
   Candidate functions:
   - detect new recent spins from two snapshots
   - convert newest-first tape to oldest-first append sequence

2. Extract board/session logic from `roulette-virtual-board.tsx`.
   Candidate modules:
   - signal detection
   - armed-session state transitions
   - placed-number snapshot alignment
   - auto-arm edge detection
   - loaded-bet dispatch preparation

3. Keep Chrome side effects at the edge.
   Build pure functions that return:
   - next local state
   - next derived bet payload
   - next status transition
   The component should only wire these results to React and `chrome.runtime.sendMessage`.

## Phase 3: Formalize Contracts

Target: make data shape and ordering rules explicit.

1. Centralize storage key contracts.
   Create a small storage contract module for keys like:
   - `evolutionRecentNumbers`
   - `evolutionTableState`
   - `rouletteResults`
   - `virtualBankroll`

2. Centralize message contracts.
   Define typed request/response payloads for background messaging instead of using untyped object literals across files.

3. Normalize sequence semantics.
   Provide named helpers for:
   - newest-first arrays
   - oldest-first arrays
   - append-only tapes
   - cumulative per-step snapshots

4. Add fixture-driven tests for critical invariants.
   Examples:
   - repeated identical spin still counts as a new spin
   - same-number signal is detected correctly
   - cumulative placement snapshots carry forward between rounds
   - auto-arm only triggers on a fresh signal edge

## Phase 4: Organize the Repo by Responsibility

Suggested direction, not an all-at-once rewrite:

```text
src/
  core/
    background/
    content/
    messaging/
    storage/
  domains/
    roulette/
      engine/
      signals/
      live-session/
      fixtures/
    bankroll/
    tennis/
  sidepanel/
    components/
    hooks/
    view-models/
  shared/
    types/
    utils/
```

Guidance:

- `domains/roulette/engine/` should contain pure algorithmic logic.
- `sidepanel/view-models/` should adapt storage/runtime state into UI-friendly props.
- `core/` should own browser integration only.

## Phase 5: Production Readiness

1. Add extension end-to-end tests with Playwright.
   Focus on critical flows, not exhaustive UI snapshots.

2. Add fixture-based scraping tests.
   Use captured HTML from `source/` to verify DOM parsers when site markup changes.

3. Add structured logging around fragile browser interactions.
   Especially:
   - chip detection
   - recent-number detection
   - bet placement acknowledgements
   - retries and misses

4. Add release discipline.
   - maintain a short change log per release
   - separate bug-fix PRs from refactor PRs when possible
   - require a manual smoke checklist for extension runtime changes

## Testing Roadmap

### First tests to add

1. `src/lib/roulette` algorithm tests
   - quadrant selection
   - auto starting quadrant
   - repeated number signal scenarios
   - placed snapshot alignment scenarios

2. `src/types` normalization tests
   - roulette result dedupe
   - storage parsing
   - append and replacement behavior

3. `roulette-workspace` ingestion tests
   - repeated head value
   - multiple new spins in one update
   - no-op update with identical snapshot

4. `roulette-virtual-board` extracted helper tests
   - auto-arm edge detection
   - disarm conditions
   - loaded-step dispatch gating

### Definition of Done for feature work

- Feature behavior is implemented.
- At least one automated test covers the new path.
- Build and typecheck pass.
- If browser-runtime behavior changed, the manual verification steps are written down in the patch summary.

## Practical Next Steps

1. Add `vitest`, `@testing-library/react`, and `jsdom`.
2. Add `typecheck` and `check` scripts.
3. Extract repeated-spin ingestion into a pure helper and test it first.
4. Extract signal and session transition helpers from `roulette-virtual-board.tsx`.
5. Add CI to run `check` on every branch and PR.
