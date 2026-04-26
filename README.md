# GaineyGlow ✦

A private, offline-first skin journal. Capture daily photos, log products and
treatments, and watch your skin change over time.

Everything lives in your browser via IndexedDB — photos and notes never leave
your device.

## Features

- **Today** — capture or upload photos, tagged by face zone (forehead, left
  cheek, right cheek, chin, nose, full face). Add a daily note.
- **Compare** — before/after slider for any zone, with thumbnail picker for
  arbitrary date pairs.
- **Products** — log every step of your routine with brand, ingredients,
  concerns it targets, AM/PM use, and start/stop dates. Ingredients are
  cross-referenced against a curated library to:
  - Auto-flag common irritants (fragrance, denatured alcohol, MIT, etc.)
  - Warn against ingredients you've marked as personal sensitivities
  - Surface cautions (e.g. retinoids increase sun sensitivity)
- **Treatments** — log facials, peels, microneedling, lasers, botox, filler
  and more. Personalized **aftercare instructions** appear automatically and
  an "Active aftercare" banner reminds you while you're still in the window.
- **Timeline** — a single chronological feed of every photo, product start/stop,
  and treatment so you can correlate routine changes with skin changes.
- **Insights** — concern coverage bars (how many products target each concern),
  sensitivity warnings across your active routine, photo streak, and
  suggestions when concerns are uncovered or overloaded.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

## Tech

- Vite + React + TypeScript
- Tailwind CSS
- Dexie (IndexedDB) for storage
- React Router (Hash router so it deploys anywhere)
- lucide-react icons

## Notes on safety

Sensitivity flags are based on a curated reference list and are **not medical
advice**. Always patch test new products and follow your dermatologist's or
treatment provider's specific instructions over any generic aftercare shown in
the app.
