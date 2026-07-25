#!/bin/sh
set -eu

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"

backup_file=/mock-backup/sonitus.dump

if [ ! -r "$backup_file" ]; then
  echo "[mock-restore] Backup file is missing or unreadable: $backup_file" >&2
  exit 1
fi

echo "[mock-restore] Restoring production snapshot into ${POSTGRES_DB}."
pg_restore \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$backup_file"
echo "[mock-restore] Snapshot restore completed."
