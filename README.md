# Myyntijärjestelmä

A web app for organizing flea-market ("pihakirppis") sales events — replaces a manual Google Sheets workflow with seller item listings, generated price tags with barcodes, a scanner-driven checkout, and real-time sales tracking.

Built with Next.js 15, TypeScript, Postgres/Prisma, and Auth.js.

## Getting started

1. Copy `.env.example` to `.env` and fill in real values:
   - `AUTH_SECRET` — generate with `npx auth secret`
   - `PII_ENCRYPTION_KEY` — a 32-byte base64 key (used to encrypt stored IBANs)
   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — from an [Upstash](https://upstash.com) Redis database (used for rate limiting)
2. Start local Postgres: `docker-compose up -d`
3. Install dependencies and set up the database:
   ```bash
   npm install
   npx prisma migrate deploy
   ```
4. Run the dev server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

A fresh database has no users — visiting `/signup` creates the first owner account (that route becomes unreachable once any user exists).

## Testing

```bash
NODE_OPTIONS='--require dotenv/config' npm test           # unit + integration tests (Vitest, hits the DATABASE_URL_TEST database)
NODE_OPTIONS='--require dotenv/config' npm run test:e2e   # end-to-end tests (Playwright, runs the app against the same test database)
```

Neither Vitest nor Playwright load `.env` automatically the way `next dev`/`next build` do, so the `NODE_OPTIONS` prefix above is required every time — without it, the test database connection fails. (On Windows, the short flag form `-r dotenv/config` doesn't work — use the long form `--require`.) The test database needs its schema set up once via `npx prisma migrate deploy` against `DATABASE_URL_TEST`.

## Deploying

See `docs/deployment.md` for the full first-time Vercel setup (Postgres provisioning, environment variables, running migrations on deploy, and creating the first owner account).

## Project docs

- `docs/deployment.md` — how to deploy this app for the first time
- `docs/next-steps.md` — what's left before a real deployment
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design specs and implementation plans for the original build and every feature added since
- `CLAUDE.md` — architecture notes and conventions for AI-assisted development in this repo
