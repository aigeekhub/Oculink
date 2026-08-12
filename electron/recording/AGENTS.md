# `electron/recording/` DOX

## Purpose

Main-process recording lifecycle, orb interaction, placement, and persisted settings logic.

## Ownership

- Authoritative recording state transitions in `recordingLifecycle.ts`
- Idempotent orb click arbitration in `orbClickCoordinator.ts`
- Validated, atomic orb preferences in `orbSettings.ts`
- Display-aware orb geometry in `orbBounds.ts`

## Local Contracts

- Accept lifecycle transitions only for the current recording ID and owning renderer.
- Treat completion as final only after renderer persistence and current-session assignment succeed.
- Reject unknown settings fields and invalid nested placement values at the IPC boundary.
- Keep geometry pure and ensure the full orb remains within a current display work area.

## Work Guidance

- Add table-driven tests for every lifecycle, validation, or geometry edge case.
- Keep Electron window side effects in `electron/main.ts` and `electron/windows.ts`.

## Verification

- `npm run test -- electron/recording`
- `npx tsc --noEmit`

## Child DOX Index
