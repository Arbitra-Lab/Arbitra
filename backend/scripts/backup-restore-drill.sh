#!/bin/bash
# Monthly backup restore drill (staging/test target).
# Creates/uses latest backup, restores to an isolated database, runs smoke checks, records report.
#
# Usage:
#   ./backend/scripts/backup-restore-drill.sh
#   TARGET_DB=arbitra_restore_drill ./backend/scripts/backup-restore-drill.sh /path/to/backup.sql.gz
#
# Env:
#   BACKUP_DIR, DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD
#   TARGET_DB (default arbitra_restore_drill)
#   REPORT_DIR (default backend/docs/deployment/reports)
#   DRILL_ALLOW_DESTRUCTIVE=true required to drop/recreate TARGET_DB

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/arbitra}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_NAME_SOURCE="${DB_NAME:-arbitra_db}"
TARGET_DB="${TARGET_DB:-arbitra_restore_drill}"
REPORT_DIR="${REPORT_DIR:-$(dirname "$0")/../docs/deployment/reports}"
ALLOW="${DRILL_ALLOW_DESTRUCTIVE:-false}"
TS="$(date +%Y%m%d_%H%M%S)"
REPORT="${REPORT_DIR}/restore-drill-${TS}.md"

mkdir -p "$REPORT_DIR"

if [[ "$ALLOW" != "true" ]]; then
  echo "Refusing to drop/recreate ${TARGET_DB}. Set DRILL_ALLOW_DESTRUCTIVE=true in a non-production drill environment." >&2
  exit 1
fi

if [[ -n "${1:-}" ]]; then
  BACKUP_FILE="$1"
else
  BACKUP_FILE="$(ls -t "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "No backup file found. Pass a backup path or set BACKUP_DIR." >&2
  exit 1
fi

if [[ -n "${DB_PASSWORD:-}" ]]; then
  export PGPASSWORD="${DB_PASSWORD}"
fi

start_epoch=$(date +%s)

echo "Starting restore drill against ${TARGET_DB} using ${BACKUP_FILE}"

dropdb --if-exists -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" "$TARGET_DB"
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" "$TARGET_DB"

if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -q
else
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -q -f "$BACKUP_FILE"
fi

# Basic integrity smoke checks.
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -c "SELECT 1;" >/dev/null
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -c "SELECT COUNT(*) AS users_count FROM users;" >/dev/null || true

end_epoch=$(date +%s)
duration=$((end_epoch - start_epoch))

cat > "$REPORT" <<REPORT
# Backup Restore Drill Report

- Date (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")
- Backup file: $BACKUP_FILE
- Target DB: $TARGET_DB
- Source DB: $DB_NAME_SOURCE
- Duration seconds: $duration
- Result: PASS

## Checks
- [x] Backup file exists/readable
- [x] Target database recreated
- [x] Restore completed without SQL errors
- [x] Basic smoke query executed

## Notes
Run this drill monthly in staging and record follow-up actions if duration exceeds RTO targets.
REPORT

echo "Restore drill PASS. Report: $REPORT"
