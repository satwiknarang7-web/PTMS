#!/bin/sh
# Prepares the API container: JWT secrets, database schema and first-run seed.
set -e

# Generate JWT secrets on first start and keep them on the data volume, so sessions
# survive restarts. Values passed in the environment always win.
SECRETS_FILE="${SECRETS_FILE:-/data/.jwt-secrets}"
if [ -z "$JWT_ACCESS_SECRET" ] || [ -z "$JWT_REFRESH_SECRET" ]; then
  if [ ! -f "$SECRETS_FILE" ]; then
    echo "Generating JWT secrets in $SECRETS_FILE"
    (umask 077 && node -e "const c=require('crypto');for(const k of ['JWT_ACCESS_SECRET','JWT_REFRESH_SECRET'])console.log(k+'='+c.randomBytes(48).toString('hex'))" > "$SECRETS_FILE")
  fi
  [ -n "$JWT_ACCESS_SECRET" ] || JWT_ACCESS_SECRET="$(sed -n 's/^JWT_ACCESS_SECRET=//p' "$SECRETS_FILE")"
  [ -n "$JWT_REFRESH_SECRET" ] || JWT_REFRESH_SECRET="$(sed -n 's/^JWT_REFRESH_SECRET=//p' "$SECRETS_FILE")"
  export JWT_ACCESS_SECRET JWT_REFRESH_SECRET
fi

cd /app/apps/api

# Drop tables that were removed from the data model, then create or update tables.
# Any other change that would lose data stops the start-up instead.
npx --no-install prisma db execute --file prisma/drop-removed-tables.sql --schema prisma/schema.prisma
npx --no-install prisma db push --skip-generate

# Creates the first root admin and the company organization.
# Every step is idempotent, so restarts never duplicate anything.
if [ "$SEED_ON_START" = "true" ]; then
  npx --no-install prisma db seed
fi

exec node dist/main
