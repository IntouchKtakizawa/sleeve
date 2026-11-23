# Sleeve

**Your music, on record.** A browser-based music rating journal, hosted on GitHub Pages.

Website: https://intouchktakizawa.github.io/sleeve/

## Features

- Search Apple Music for songs or albums, or open the same query in Spotify
- Paste any Spotify song or album link to rate it using Spotify oEmbed metadata
- Explore a shuffled mix by genre or roll a random song with artwork and release details
- Tap the colour-changing score buttons or fine-tune in 0.1 increments
- Rate songs and albums from 0–10, keep notes and mark favourites
- Search your own collection and sort by date, score, song or artist
- Light and dark themes
- Automatic browser-local saving, with changes reflected across open tabs
- JSON backup export and validated merge import
- CSV export with spreadsheet formula protection
- Edit ratings and undo removal
- **Listening:** connect Last.fm (works with Spotify and Apple Music scrobbling) or import Spotify's StreamingHistory export, then rate what you actually played in one tap
- **Recap cards:** a Stories-sized image of your month, year or all-time top-rated records, average score, rating streak and taste label
- **Taste match:** share a link that carries your top 40 records (never your notes). Friends see a match score, records you both rated, and picks to try

Set `VITE_LASTFM_API_KEY` at build time to ship a Last.fm API key so people only need their username. Without it, the app asks each person for their own free key.

No login, account or external database is used by the GitHub Pages app. Ratings, notes, favourites and theme preferences stay in the current browser on this origin. Online search and artwork require an internet connection to the relevant music service. The random generator shuffles a curated mix without repeating tracks until the current genre pool runs out. Clearing site data, using private browsing or switching browsers can remove or separate local collections. Export a JSON backup to move or restore your ratings.

## Backups

Open **My collection → Export backup** to download a versioned JSON file. On another browser or device, open **Import backup**. Import validates the whole file before saving, merges by catalogue ID and music type and keeps the most recently updated rating for duplicates. An invalid file leaves the collection unchanged. CSV is intended for spreadsheets, not re-import.

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

Data tests cover backup round-trips, import merging, malformed-file rejection, URL validation, CSV escaping and duplicate normalization. TypeScript and production builds pass.
