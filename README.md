# Sleeve

**Your music, on record.** A browser-based music rating journal, hosted on GitHub Pages.

Website: https://intouchktakizawa.github.io/sleeve/

## Features

- Search Apple's iTunes music catalogue by song or artist
- Drag the vinyl dial, use the slider, or fine-tune scores in 0.1 increments
- Rate from 0–10, keep notes and mark favourites
- Search your own collection and sort by date, score, song or artist
- Light and dark themes
- Automatic browser-local saving, with changes reflected across open tabs
- JSON backup export and validated merge import
- CSV export with spreadsheet formula protection
- Edit ratings and undo removal

No login, account or external database is used by the GitHub Pages app. Ratings, notes, favourites and theme preferences stay in the current browser on this origin. Song searches and artwork still require an internet connection to Apple. Clearing site data, using private browsing or switching browsers can remove or separate local collections. Export a JSON backup to move or restore your ratings.

## Backups

Open **My collection → Export backup** to download a versioned JSON file. On another browser or device, open **Import backup**. Import validates the whole file before saving, merges by song ID and keeps the most recently updated rating for duplicates. An invalid file leaves the collection unchanged. CSV is intended for spreadsheets, not re-import.

## Development

Requires Node.js 24 or later for the native TypeScript tests.

```sh
npm ci
npm run dev
npm run test
npx tsc --noEmit
npm run build:pages
```

The static entry point is `pages/main.tsx`, the app is `app/sleeve.tsx`, local persistence and backup validation are in `lib/local-library.ts`, and `vite.pages.config.ts` builds into `docs/` with the `/sleeve/` base path. GitHub Pages publishes `main:/docs`. Commit generated output and `docs/.nojekyll` with source updates.

The repository retains the earlier server starter and API code for history, but the Pages bundle makes no account or rating API requests and uses no ChatGPT authentication. The earlier server-hosted version is separate from this app; server-stored ratings are not automatically migrated.

## Validation

Six data tests cover backup round-trips, import merging, malformed-file rejection, URL validation, CSV escaping and duplicate normalization. TypeScript and production builds pass. Browser verification covers saving a favourite without login, persistence after reload, JSON export and dark mode.
