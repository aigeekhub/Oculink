# `src/` DOX

## Purpose

Renderer-side React code for the launch flow, editor, timeline, hooks, shared libs, and localization.

## Ownership

- UI in `src/components/`
- Application settings UI in `src/components/settings/` and the compact recording indicator in `src/components/recording-orb/`
- React entry points and contexts in `src/main.tsx` and `src/contexts/`
- Shared logic in `src/lib/` and `src/hooks/`
- Locale data and translation loaders in `src/i18n/`

## Local Contracts

- Keep renderer changes TypeScript-strict and Biome-compliant.
- Prefer small, testable units for editor and timeline behavior.
- Update or add tests next to the code under test.
- Keep translations in sync when touching user-facing strings.
- Application-level recording settings use the typed Electron bridge; editor-local preferences remain separate.

## Work Guidance

- Use existing component and hook patterns before introducing new abstractions.
- Treat video/editor state changes as user-facing behavior and verify them carefully.

## Verification

- `npm run test`
- `npm run test:browser` when DOM or Pixi rendering behavior changes
- `npm run i18n:check` when locale files change

## Child DOX Index

- `src/components/` - launch UI, application settings, recording orb, video editor, and shared UI components. Settings and orb contracts are in `src/components/settings/AGENTS.md` and `src/components/recording-orb/AGENTS.md`.
- `src/hooks/` - recorder, device, and editor hooks.
- `src/lib/` - shared recording, export, cursor, and utility logic.
  - Exporter-specific contracts: `src/lib/exporter/AGENTS.md`.
- `src/i18n/` - loader, config, and locale bundles.
- `src/contexts/` - React providers for i18n and shortcuts.
