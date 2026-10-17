# oobee bets

Next.js 16 app (App Router, server actions) on Postgres via Drizzle.

## Branches and deploys

| Branch | Site | Deploy hook |
| --- | --- | --- |
| `main` | oobeebets.com | `https://nemanjas.dev/hooks/oobeebets` |
| `beta` | beta.oobeebets.com | `https://nemanjas.dev/hooks/beta-oobeebets` |

A push deploys **only after CI passes**: the `deploy` / `deploy-beta` jobs in
`.github/workflows/deploy.yaml` call the hook once `checks` (typecheck, lint,
build, migrate, seed, verify, e2e) is green. A red run ships nothing.

The repo's own push webhooks to those hooks deployed every push untested,
minutes before CI finished; they were deactivated on 2026-10-15 (GitHub →
Settings → Webhooks, to turn them back on).

Migrations run on container start, so back up the database before pushing
anything with a new migration.

## Checks, locally

```sh
npm run typecheck && npm run lint && npm run build
npm run db:migrate && ALLOW_DESTRUCTIVE_SEED=1 npm run db:seed   # throwaway database only
npm start & npm run verify && npm run e2e
```

`verify` and `e2e` create and drop their own fixtures, including today's slate:
never point them at a database with real data.
