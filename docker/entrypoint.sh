#!/bin/sh
set -e

# Migrations run before the server accepts traffic. With several replicas they
# all race here; Drizzle's migration table makes that safe — the losers see the
# work already done and exit cleanly.
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  node ./docker/migrate.mjs
fi

exec "$@"
