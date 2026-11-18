# Sleeve

A personal music rating journal. Search the iTunes song catalogue, rate songs from 0–10 in 0.1 increments, add listening notes, and keep a private collection across devices.

Live app: https://sleeve.hahekenna.chatgpt.site

## Features
- Responsive editorial design with custom record artwork and album covers
- Search by title or artist, with genre discovery shortcuts
- Interactive vinyl score display and keyboard-accessible rating slider
- Sign in with ChatGPT; per-user D1 records, authorized on the server
- Edit or delete ratings; sort by recency, score, or artist
- Loading, empty, error, and signed-out states

## Development
Requires Node 22.13 or later. Run `npm ci`, then `npm run dev`.
Run `npx tsc --noEmit` to check types and `npm run build` for a production build.

The project uses React, Vinext/Vite, Cloudflare Workers, Drizzle and D1. The hosted authentication endpoints and identity headers are supplied by ChatGPT Sites. GitHub stores the source; GitHub Pages alone cannot run the server, authentication or database. For standalone hosting, provide an identity adapter and D1 binding.

Database schema: `db/schema.ts`. Generated migrations: `drizzle/`. Apply migrations locally using the command in the starter's development documentation or the Wrangler D1 CLI after building. Production migrations are applied during Sites deployment.

Search uses a direct browser request with a server fallback to Apple's public iTunes Search API (US storefront). Catalogue coverage is not every song ever released. Album artwork links to the corresponding Apple Music page. No streaming API credentials are needed. Saved user notes and ratings live only in the database, never in GitHub. Browser storage is not used as the ratings database.

## Validation
- TypeScript and production build
- Browser checks for layout and signed-out collection
- Live API check confirms anonymous collection requests receive HTTP 401
- Account persistence requires a signed-in browser to verify end to end

No external OAuth client secrets are included in this repository.

## GitHub Pages

`npm run build:pages` builds the browsing interface into `docs/`, served at `/sleeve/`. Song search and the rating preview run in the browser. Sign-in and saving continue on the separately hosted Sleeve account site because GitHub Pages cannot execute API routes or D1. The GitHub version does not pretend to be signed in or store ratings in browser storage.
