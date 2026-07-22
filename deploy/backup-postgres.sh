#!/bin/sh
set -eu

: "${POSTGRES_HOST:?POSTGRES_HOST is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

backup_dir=/backups
retention_days="${BACKUP_RETENTION_DAYS:-14}"
interval_seconds="${BACKUP_INTERVAL_SECONDS:-86400}"

mkdir -p "$backup_dir"

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  destination="$backup_dir/${POSTGRES_DB}_${timestamp}.dump"
  temporary="${destination}.tmp"

  echo "[backup] PostgreSQL backup started: $destination"
  pg_dump \
    --host="$POSTGRES_HOST" \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --format=custom \
    --file="$temporary"
  mv "$temporary" "$destination"
  find "$backup_dir" -type f -name '*.dump' -mtime "+$retention_days" -delete
  echo "[backup] PostgreSQL backup completed: $destination"

  sleep "$interval_seconds"
done
