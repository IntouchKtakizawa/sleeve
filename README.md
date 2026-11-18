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

Search uses Apple's public iTunes Search API (US storefront). Catalogue coverage is not every song ever released. Album artwork links to the corresponding Apple Music page. No streaming API credentials are needed. Saved user notes and ratings live only in the database, never in GitHub. Browser storage is not used as the ratings database.

## Validation
- TypeScript and production build
- Browser checks for search, dialog, scoring and signed-out collection
- API checks for persistence, deletion, and account isolation in the local database

No external OAuth client secrets are included in this repository.
