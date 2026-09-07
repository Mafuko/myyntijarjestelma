# Deploying to Vercel

This is the first-time setup for a real deployment. It assumes the GitHub repo already exists and is up to date.

## 1. Provision Postgres (Neon)

1. Create a free [Neon](https://neon.tech) project.
2. Neon gives you two connection strings for the same database: a **pooled** one (hostname contains `-pooler`) and a **direct** one. Use the **direct** connection string as `DATABASE_URL`, not the pooled one.
   - Why: `prisma migrate deploy` takes a Postgres advisory lock to stop two concurrent migration runs from colliding. PgBouncer's transaction-pooling mode (what Neon's pooled endpoint uses) doesn't preserve session state across queries, which breaks advisory locks — migrations can fail intermittently through it. Since this schema has no separate `directUrl` for migrations (`prisma.config.ts` and `lib/db.ts` both read a single `DATABASE_URL`), the simplest reliable setup is to skip the pooler entirely.
   - At this project's scale (one small deployment, a handful of concurrent checkout stations during a single event) Neon's direct-connection limit is far more than enough. If a future deploy ever needs the pooler for higher concurrency, that requires adding `directUrl` to `prisma/schema.prisma`'s datasource block first — not needed today.
3. Copy the direct connection string — you'll set it as `DATABASE_URL` in Vercel in step 3.

## 2. Create the Vercel project

1. Import the GitHub repo into Vercel. The Next.js framework preset is auto-detected — no config needed.
2. Do **not** deploy yet — set environment variables first (step 3), since the first build runs migrations against whatever `DATABASE_URL` is set at build time.

## 3. Environment variables

Set these in the Vercel project's Settings → Environment Variables (Production environment). None of these are committed to the repo.

| Variable | How to get it |
|---|---|
| `DATABASE_URL` | The **direct** (non-pooled) Neon connection string from step 1. |
| `AUTH_SECRET` | Generate with `npx auth secret` — run locally, paste the output in. |
| `PII_ENCRYPTION_KEY` | Generate with `openssl rand -base64 32`. See the dedicated section below before setting this — it's not a normal env var to lose. |
| `UPSTASH_REDIS_REST_URL` | Reuse the existing Upstash Redis database used by CI — get the value from the [Upstash console](https://console.upstash.com) (the database's Details page has a "REST API" section showing both values). **Not** from the GitHub Actions secret of the same name: GitHub secrets are write-only and can't be viewed again once saved, only overwritten — Upstash's own dashboard is the actual source of truth. No new Upstash database needed. |
| `UPSTASH_REDIS_REST_TOKEN` | Same as above. |

### `PII_ENCRYPTION_KEY` handling

This key encrypts sellers' stored IBANs. Treat it like a credential, not a config value:

- **Generate it once**, at first deploy: `openssl rand -base64 32`.
- **Store it** only in Vercel's environment variables (never in a committed file, never in Slack/email/chat history).
- **Back up a copy** somewhere durable outside Vercel — a password manager entry is enough. Losing this key makes every already-stored IBAN permanently unrecoverable; there is no recovery path.
- **Rotation is not supported yet.** Rotating the key would require re-encrypting every existing row, which isn't built (see `docs/next-steps.md`). Don't rotate it on a whim — only if it's actually been compromised, and treat that as a real incident requiring new tooling, not a routine operation.

## 4. First deploy

1. Trigger the deploy (push to the production branch, or click Deploy in Vercel).
2. The build runs `prisma migrate deploy && next build` (wired into `package.json`'s `build` script), so pending migrations apply automatically before the app builds. Watch the build log — a migration failure fails the whole build, which is the intended behavior (better than deploying against a stale schema).
3. Once live, visit `https://<your-app>.vercel.app/signup` **once** to create the first owner account. This route is a Server Component that checks `prisma.user.count() === 0` on every request and redirects to `/login` once any user exists — so it self-disables after this one use and is safe to leave in the deployed app.

## 5. Post-deploy smoke check

Walk through the app once as the new owner to confirm the real deployment works end to end, not just the build:

- [ ] Log in with the owner account just created.
- [ ] Create an event.
- [ ] Add an item as a seller (invite yourself or use the owner account if it has a membership).
- [ ] Generate a price tag PDF for that item and confirm the barcode renders.
- [ ] Run one checkout by scanning (or typing) that item's barcode.
- [ ] Confirm the sales dashboard updates live.

## Known follow-ups

This runbook covers what's needed to deploy today. Two related items are tracked separately in `docs/next-steps.md` and aren't part of this process yet:

- **No error/monitoring visibility** — nothing currently surfaces a runtime failure (e.g. a failed sale, a broken PDF render) beyond Vercel's function logs. Watch those logs during the first real event.
- **`PII_ENCRYPTION_KEY` rotation** — not built; see the handling section above for the current (document-and-never-lose-it) approach.
