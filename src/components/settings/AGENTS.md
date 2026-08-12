# `src/components/settings/` DOX

## Purpose

Application-level settings rendered in the dedicated Electron settings window.

## Ownership

- Settings window composition in `AppSettings.tsx`
- Recording-orb controls and live persistence in `RecordingOrbSettings.tsx`

## Local Contracts

- Use the typed Electron settings bridge and display normalized snapshots returned by main.
- Localize all visible copy and accessible names through the settings namespace.
- Controls auto-save; reset restores the main-process defaults.

## Work Guidance

- Preserve accessible roles and names for switches, sliders, selects, and status text.

## Verification

- `npm run test -- src/components/settings`
- `npm run i18n:check` when locale parity is otherwise clean

## Child DOX Index
