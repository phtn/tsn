---
name: watchful-wind-engineering
description: Use this skill when building features, fixing bugs, refactoring, or reviewing changes in the watchful-wind repository. It defines the repo's runtime boundaries, regression-prone areas, testing policy, and required validation workflow so agents minimize cross-component breakage.
---

# Watchful Wind Engineering

Use this skill for any non-trivial work in this repository.

## Repo Map

- `src/core/`
  Runtime-facing extension code. `content.ts` scrapes DOM state and writes to `chrome.storage.local`. `background.ts` brokers messages and privileged actions. `injected.ts` handles page-level hooks.
- `src/sidepanel/`
  Sidepanel UI and view composition. Keep presentation here; avoid burying fragile business rules inside components.
- `src/lib/`
  Pure or mostly-pure domain logic. Roulette math, bankroll logic, formatting helpers, and reusable transforms belong here.
- `src/types.ts` and `src/types/*`
  Data contracts, normalization helpers, and storage-safe parsing.
- `source/`
  Captured HTML or reference material for scraping-driven features.

## Non-Negotiable Rules

1. Keep domain logic out of UI-heavy components.
   If a change affects ordering, signal detection, session state, placement math, bankroll math, storage normalization, or retry logic, extract the logic into a pure helper in `src/lib/` or a focused sidepanel helper before modifying JSX-heavy files.

2. Preserve ordering contracts explicitly.
   Many regressions in this repo come from array direction changes.
   Current critical conventions:
   `evolutionRecentNumbers` is newest-first.
   `liveWinningNumbers` and `winningNumbers` in the board flow are oldest-first.
   `trackedWinningNumbers` is the armed-session, oldest-first sequence consumed by the simulator.
   `placedLog` is per dispatched bet step; cumulative table state must be derived from it rather than assumed.
   Whenever you touch one of these arrays, document the expected order in code comments and validate all downstream consumers.

3. Treat `content -> storage -> sidepanel` as a contract boundary.
   A change in `src/core/content.ts` is never isolated. Audit readers in `src/sidepanel/sidepanel-app.tsx`, workspace components, and any normalization function in `src/types*`.

4. Prefer one source of truth for derived state.
   If two components recompute the same roulette/session logic, extract it. Repeated ad hoc derivations are a regression source.

5. Do not ship feature work without test coverage.
   Every new feature must add at least one meaningful automated test.
   Every bug fix should add regression coverage unless the user explicitly says not to or the environment makes it impossible.

## Required Workflow

1. Map the full path of the behavior before editing.
   For roulette features this usually means:
   `content.ts` -> storage keys -> `sidepanel-app.tsx` loaders -> workspace adapter -> board/component logic -> background message side effects.

2. Identify the invariant that must stay true.
   Examples:
   repeated spins must still advance the sequence;
   auto-arm should only trigger on a new signal edge;
   live placed numbers must stay aligned with simulation steps;
   storage-normalized results must be append-safe and dedupe-safe.

3. Add or update coverage before finalizing the change.
   Prefer pure deterministic tests first.
   If the bug lives inside a component because the logic is still embedded there, extract the logic first, then test the extracted function.

4. Make the smallest coherent fix.
   Avoid mixing behavior changes, visual cleanup, and refactors in one patch unless the refactor is required to make the fix safe.

5. Run validation.
   Minimum validation for code changes:
   `npm run build`
   `npx tsc --noEmit`
   relevant automated tests once a runner exists
   targeted manual verification for extension/runtime flows

## Testing Policy

The project currently lacks a configured test runner. That is a gap, not a reason to skip tests.

### Current expectation

- New logic should be written in a way that can be tested outside the browser runtime.
- When adding a feature, prefer extracting the core behavior into `src/lib/` or a small helper module and add coverage there as soon as the repo has a runner.
- When fixing a bug, capture the failing scenario in a deterministic fixture, scenario list, or helper contract so the later automated test is obvious.

### Target test layers

1. Unit tests
   For `src/lib/`, `src/types*`, data normalization, ordering helpers, bankroll math, and roulette algorithms.

2. Component/integration tests
   For sidepanel state adaptation, storage-driven rendering, and UI reactions to derived state.

3. Extension end-to-end tests
   For critical browser flows: DOM scraping, message passing, storage updates, and sidepanel rendering.

### Recommended stack

- `Vitest` for unit and integration tests.
- `@testing-library/react` for sidepanel/component tests.
- `Playwright` for Chrome extension end-to-end coverage.

Read [references/production-grade-plan.md](references/production-grade-plan.md) when the task is about introducing the test stack, CI gates, or larger repo organization work.

## Regression Hotspots

- Roulette live sequence ingestion in `roulette-workspace.tsx`
- Session logic and auto/load behavior in `roulette-virtual-board.tsx`
- Storage normalization in `src/types.ts` and `src/types/roulette.ts`
- Chrome message contracts in `src/core/background.ts`
- DOM-derived data capture in `src/core/content.ts`

## Change Checklist

- Did I verify the direction and indexing of every array I touched?
- Did I inspect upstream producers and downstream consumers?
- Did I keep business logic out of JSX where possible?
- Did I add or at least define regression coverage for the scenario?
- Did I run `npm run build` and `npx tsc --noEmit`?
- Did I avoid unrelated cleanup in the same patch?
