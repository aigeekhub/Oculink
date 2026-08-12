# `tests/` DOX

## Purpose

Playwright end-to-end coverage and reusable fixtures.

## Ownership

- E2E specs in `tests/e2e/`
- Fixtures and sample media in `tests/fixtures/`

## Local Contracts

- Keep test names descriptive and behavior-focused.
- Add or update coverage for user-visible regressions.

## Work Guidance

- Prefer stable selectors and deterministic setup/teardown.
- Keep platform-specific coverage isolated to the relevant spec.

## Verification

- `npm run test:e2e`
- Any narrower Playwright command for the touched spec
- The live Windows recording-orb smoke requires a visible interactive desktop and a fresh `npm run build-vite` output.

## Child DOX Index

- `tests/e2e/` - browser-driven end-to-end specs.
- `tests/fixtures/` - sample media and fixture inputs.
