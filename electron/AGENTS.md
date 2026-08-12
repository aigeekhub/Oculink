# `electron/` DOX

## Purpose

Main-process Electron code for window lifecycle, menus, tray integration, IPC, permissions, and native capture orchestration.

## Ownership

- Main process bootstrapping in `electron/main.ts`
- Main-owned recording lifecycle and recording-orb settings in `electron/recording/`
- IPC handlers and state in `electron/ipc/`
- Window factories in `electron/windows.ts`
- Global shortcut and single-instance behavior in `electron/globalShortcut.ts` and `electron/singleInstanceLock.ts`

## Local Contracts

- Treat changes here as security-sensitive.
- Preserve native permission and capture behavior across platforms.
- Keep IPC contracts aligned with renderer expectations.
- Recording completion is accepted only from the owning renderer after persistence and current-session assignment.
- Recording-orb settings are validated and persisted by the main process; renderer controls receive normalized snapshots.

## Work Guidance

- Prefer explicit window lifecycle handling over implicit side effects.
- Keep platform-specific logic isolated and documented.

## Verification

- `npm run test`
- Manual launch of the Electron app on the target OS for any window or native-capture change

## Child DOX Index

- `electron/ipc/` - IPC handlers, bridges, and stream plumbing.
  - IPC-specific contracts: `electron/ipc/AGENTS.md`.
- `electron/native/` - native capture helpers for macOS and Windows.
- `electron/diagnostics/` - log buffering and diagnostic helpers.
- `electron/recording/` - recording lifecycle, orb click arbitration, persisted orb settings, and display geometry. See `electron/recording/AGENTS.md`.
