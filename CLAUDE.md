# GaineyGlow — Claude working notes

## Brand
- The product name is **GaineyGlow** (one word). Never write "Gainey Glow".

## Workflow preferences
- **Auto-merge**: After pushing a feature branch and opening a PR, mark it
  ready for review and squash-merge it into `main` without asking. The user
  has authorized this in advance.
- **Deploy**: `main` is wired to GitHub Pages via `.github/workflows/deploy.yml`.
  Every merge to main triggers a build that publishes to
  https://gaineychristina-gittyup.github.io/Gainey-glow/.
- **Branch**: Continue using `claude/gainey-glow-skincare-app-8WBvP` as the
  designated dev branch (per session instructions).

## Stack reminder
- Vite + React + TypeScript, Tailwind, Dexie (IndexedDB), HashRouter.
- All user data is local-first. The only external network call is the
  Gemini product scanner — and only when the user taps Scan with their own
  API key configured in Settings.

## Schema versions (Dexie)
- v1: photos, products, treatments, sensitivities, profile
- v2: routineLogs (`[date+productId+period]`)
- v3: checkins (unique on date)

When adding a new table, bump the version, do NOT mutate existing version
blocks — Dexie migrations rely on them.
