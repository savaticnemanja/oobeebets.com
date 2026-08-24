#!/bin/sh
set -e

# Migrations run before the server accepts traffic. With several replicas they
# all race here; Drizzle's migration table makes that safe — the losers see the
# work already done and exit cleanly.
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  node ./docker/migrate.mjs
fi

# Seeding DELETES every row in every table, then writes one admin account. It
# is OFF unless RUN_SEED=1 is passed in, and off is the default on purpose:
# this used to run on every container start, so each deploy silently wiped the
# accounts testers had signed up with. A wipe is now something you ask for.
#
# src/db/seed.ts refuses under NODE_ENV=production and without
# ALLOW_DESTRUCTIVE_SEED, precisely so no deployed environment can seed itself.
# Passing RUN_SEED=1 here is the deliberate opt-out of that protection, so both
# are overridden for this one process only — the server below still runs under
# the image's real NODE_ENV.
if [ "${RUN_SEED:-0}" = "1" ]; then
  NODE_ENV=development ALLOW_DESTRUCTIVE_SEED=1 node ./docker/seed.mjs
fi

exec "$@"
