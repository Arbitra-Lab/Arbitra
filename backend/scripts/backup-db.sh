#!/bin/bash
# Database Backup Script
# Uses DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME from env (or .env).
# Optional: BACKUP_DIR (default /var/backups/arbitra), RETENTION_DAYS (default 30).
# For Docker: set USE_DOCKER=1 and DOCKER_CONTAINER=arbitra-postgres-production.

set -e

BACKUP_DIR="${BACKUP_DIR:-/var/backups/arbitra}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_NAME="${DB_NAME:-arbitra_db}"

mkdir -p "$BACKUP_DIR"
echo "Starting database backup..."

if [ "${USE_DOCKER}" = "1" ]; then
  CONTAINER="${DOCKER_CONTAINER:-arbitra-postgres-production}"
  docker exec "$CONTAINER" pg_dump -U "$DB_USERNAME" "$DB_NAME" > "$BACKUP_DIR/backup_${TIMESTAMP}.sql"
else
  export PGPASSWORD="${DB_PASSWORD}"
  pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" "$DB_NAME" -F p -f "$BACKUP_DIR/backup_${TIMESTAMP}.sql"
  unset PGPASSWORD
fi

ln -sf "$BACKUP_DIR/backup_${TIMESTAMP}.sql" "$BACKUP_DIR/latest_db_backup.sql"
gzip "$BACKUP_DIR/backup_${TIMESTAMP}.sql"
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql.gz"
echo "✓ Backup created: backup_${TIMESTAMP}.sql.gz"

# Optional cross-region replication (issue #134: RPO 1h / RTO 4h DR target)
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  aws s3 cp "$BACKUP_FILE" "s3://${BACKUP_S3_BUCKET}/full/backup_${TIMESTAMP}.sql.gz" --sse AES256
  if [ -n "${BACKUP_REPLICA_S3_BUCKET:-}" ]; then
    aws s3 cp "$BACKUP_FILE" "s3://${BACKUP_REPLICA_S3_BUCKET}/full/backup_${TIMESTAMP}.sql.gz"       --region "${BACKUP_REPLICA_REGION:-eu-west-1}" --sse AES256
    echo "✓ Backup replicated to s3://${BACKUP_REPLICA_S3_BUCKET}/full/"
  fi
fi

find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
echo "✓ Backup completed successfully"
