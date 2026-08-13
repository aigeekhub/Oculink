# `src/components/recording-orb/` DOX

## Purpose

Lightweight renderer for the main-owned recording indicator window.

## Ownership

- Recording lifecycle and settings presentation in `RecordingOrb.tsx`

## Local Contracts

- Read state through the typed Electron bridge; do not infer recording truth locally.
- Keep the renderer focus-free, transparent, responsive to window size, and respectful of reduced motion.
- Do not load editor-only resources or custom fonts in the orb window.

## Work Guidance

- Keep interactions delegated to the main-process click coordinator.

## Verification

- `npm run test -- src/components/recording-orb`

## Child DOX Index
