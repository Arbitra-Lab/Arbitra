import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

export interface IndexRecommendation {
  table: string;
  columns: string[];
  reason: string;
  sql: string;
  estimatedImpact: 'high' | 'medium' | 'low';
  sourceQuery?: string;
}

export interface IndexOptimizationReport {
  generatedAt: string;
  analyzedQueries: number;
  slowQueries: any[];
  recommendations: IndexRecommendation[];
  appliedIndexes: Array<{
    indexName: string;
    sql: string;
    appliedAt: string;
    dryRun: boolean;
  }>;
  stagingValidation: Array<{ sql: string; valid: boolean; error?: string }>;
}

@Injectable()
export class DatabasePerformanceService {
  private readonly logger = new Logger(DatabasePerformanceService.name);
  private lastReport: IndexOptimizationReport | null = null;
  private readonly reportRecipients = (
    process.env.DB_INDEX_REPORT_RECIPIENTS || ''
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  constructor(private readonly dataSource: DataSource) {}

  async getIndexUsage() {
    return this.dataSource.query(`
      SELECT
          schemaname,
          tablename,
          indexname,
          idx_scan as index_scans,
          idx_tup_read as tuples_read,
          idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
      ORDER BY idx_scan DESC;
    `);
  }

  async getIndexSizes() {
    return this.dataSource.query(`
      SELECT
          tablename,
          indexname,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
          pg_relation_size(indexrelid) as index_size_bytes
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
      ORDER BY pg_relation_size(indexrelid) DESC;
    `);
  }

  async getTableSizes() {
    return this.dataSource.query(`
      SELECT
          relname as table_name,
          pg_size_pretty(pg_total_relation_size(relid)) as total_size,
          pg_size_pretty(pg_relation_size(relid)) as table_size,
          pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) as external_size,
          pg_total_relation_size(relid) as total_size_bytes
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(relid) DESC;
    `);
  }

  async getSlowQueries(limit = 100) {
    try {
      return await this.dataSource.query(
        `
        SELECT
            query,
            calls,
            total_exec_time,
            min_exec_time,
            max_exec_time,
            mean_exec_time,
            stddev_exec_time,
            rows,
            shared_blks_hit,
            shared_blks_read
        FROM pg_stat_statements
        ORDER BY mean_exec_time DESC, total_exec_time DESC
        LIMIT $1;
      `,
        [limit],
      );
    } catch (error: any) {
      this.logger.warn(
        'pg_stat_statements not available or accessible:',
        error?.message,
      );
      return [];
    }
  }

  async getDatabaseSettings() {
    const settings = [
      'max_connections',
      'shared_buffers',
      'effective_cache_size',
      'maintenance_work_mem',
      'checkpoint_completion_target',
      'wal_buffers',
      'default_statistics_target',
      'random_page_cost',
      'effective_io_concurrency',
      'work_mem',
      'min_wal_size',
      'max_wal_size',
    ];

    return this.dataSource.query(
      `
      SELECT name, setting, unit, description
      FROM pg_settings
      WHERE name = ANY($1);
    `,
      [settings],
    );
  }

  async getUnusedIndexes(minScans = 10, minSizeBytes = 10 * 1024 * 1024) {
    return this.dataSource.query(
      `
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
        pg_relation_size(indexrelid) as index_size_bytes
      FROM pg_stat_user_indexes
      WHERE schemaname = 'public'
        AND idx_scan < $1
        AND pg_relation_size(indexrelid) > $2
      ORDER BY pg_relation_size(indexrelid) DESC
    `,
      [minScans, minSizeBytes],
    );
  }

  async getDuplicateIndexCandidates() {
    return this.dataSource.query(`
      SELECT
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
        pg_relation_size(indexrelid) as index_size_bytes,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
  }

  async getIndexRecommendations() {
    const [indexUsage, indexSizes, tableSizes, unused] = await Promise.all([
      this.getIndexUsage(),
      this.getIndexSizes(),
      this.getTableSizes(),
      this.getUnusedIndexes(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalIndexes: indexUsage.length as number,
        totalIndexSize: (indexSizes as any[]).reduce(
          (sum: number, idx: any) => sum + Number(idx.index_size_bytes || 0),
          0,
        ),
        unusedIndexes: unused.length as number,
      },
      indexUsage,
      indexSizes,
      tableSizes,
      unusedIndexes: unused,
      recommendations: this.generateIndexRecommendations(unused as any[]),
    };
  }

  private generateIndexRecommendations(unused: any[]): string[] {
    const recs: string[] = [];
    if (unused.length > 0) {
      recs.push(
        `Consider dropping ${unused.length} unused or rarely-used index(es) to reduce write overhead and save disk space.`,
      );
    }
    recs.push(
      'Run nightly index optimization job for slow-query based recommendations.',
    );
    return recs;
  }

  async getPerformanceReport() {
    const [indexUsage, indexSizes, tableSizes, slowQueries, settings, unused] =
      await Promise.all([
        this.getIndexUsage(),
        this.getIndexSizes(),
        this.getTableSizes(),
        this.getSlowQueries(),
        this.getDatabaseSettings(),
        this.getUnusedIndexes(),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      indexUsage,
      indexSizes,
      tableSizes,
      slowQueries,
      settings,
      unusedIndexes: unused,
      lastOptimizationReport: this.lastReport,
    };
  }

  recommendIndexesFromSlowQueries(
    slowQueries: Array<{
      query: string;
      mean_exec_time?: number;
      calls?: number;
    }>,
  ): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = [];
    const seen = new Set<string>();

    for (const row of slowQueries) {
      const query = String(row.query || '');
      const normalized = query.replace(/\s+/g, ' ').trim();
      if (!normalized || normalized.length < 20) continue;
      if (/^(\s*(BEGIN|COMMIT|ROLLBACK|SET|SHOW))/i.test(normalized)) continue;

      const tableMatch =
        normalized.match(/\bfrom\s+([a-zA-Z_][\w.]*)/i) ||
        normalized.match(/\bupdate\s+([a-zA-Z_][\w.]*)/i);
      const table = tableMatch?.[1]?.replace(/"/g, '');
      if (!table || table.startsWith('pg_')) continue;

      const cols = new Set<string>();
      const whereMatch = normalized.match(
        /\bwhere\s+(.+?)(\bgroup\b|\border\b|\blimit\b|$)/i,
      );
      const orderMatch = normalized.match(/\border\s+by\s+(.+?)(\blimit\b|$)/i);
      const joinMatch = normalized.match(
        /\bjoin\s+\S+\s+on\s+(.+?)(\bwhere\b|\bgroup\b|\border\b|\blimit\b|$)/i,
      );
      const source = [whereMatch?.[1], orderMatch?.[1], joinMatch?.[1]]
        .filter(Boolean)
        .join(' ');
      const colRegex = /\b([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*)\b/g;
      let m: RegExpExecArray | null;
      while ((m = colRegex.exec(source))) {
        const col = m[2];
        if (!['id', 'created_at'].includes(col)) cols.add(col);
      }
      // Fallback simple column names
      const simpleRegex = /\b([a-zA-Z_][\w]*)\s*(=|>|<|>=|<=|IN|LIKE)/gi;
      while ((m = simpleRegex.exec(source))) {
        const col = m[1];
        if (!['WHERE', 'AND', 'OR', 'ON', 'select', 'from'].includes(col))
          cols.add(col);
      }

      const columns = Array.from(cols).slice(0, 3);
      if (columns.length === 0) continue;
      const idxName =
        `idx_auto_${table.replace(/\./g, '_')}_${columns.join('_')}`
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .slice(0, 60);
      const key = `${table}:${columns.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const sql = `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${idxName} ON ${table} (${columns.map((c) => `"${c}"`).join(', ')})`;
      recommendations.push({
        table,
        columns,
        reason: `Slow query pattern detected (mean_exec_time=${row.mean_exec_time ?? 'n/a'}, calls=${row.calls ?? 'n/a'})`,
        sql,
        estimatedImpact:
          Number(row.mean_exec_time || 0) > 100 ? 'high' : 'medium',
        sourceQuery: normalized.slice(0, 300),
      });
    }

    return recommendations.slice(0, 20);
  }

  async validateIndexesInStaging(recommendations: IndexRecommendation[]) {
    const results: Array<{ sql: string; valid: boolean; error?: string }> = [];
    const stagingDataSource = this.createStagingDataSource();
    if (!stagingDataSource) {
      return recommendations.map((r) => ({
        sql: r.sql,
        valid: false,
        error: 'Staging database not configured',
      }));
    }

    try {
      await stagingDataSource.initialize();
      for (const rec of recommendations) {
        try {
          await stagingDataSource.query('BEGIN');
          await stagingDataSource.query(rec.sql.replace('CONCURRENTLY ', ''));
          await stagingDataSource.query('ROLLBACK');
          results.push({ sql: rec.sql, valid: true });
        } catch (error: any) {
          try {
            await stagingDataSource.query('ROLLBACK');
          } catch (rollbackError: any) {
            this.logger.debug(
              `Staging rollback failed after validation error: ${rollbackError?.message || rollbackError}`,
            );
          }
          results.push({
            sql: rec.sql,
            valid: false,
            error: error?.message || 'validation failed',
          });
        }
      }
    } catch (error: any) {
      return recommendations.map((r) => ({
        sql: r.sql,
        valid: false,
        error: error?.message || 'staging unavailable',
      }));
    } finally {
      if (stagingDataSource.isInitialized) await stagingDataSource.destroy();
    }
    return results;
  }

  private createStagingDataSource(): DataSource | null {
    const url = process.env.STAGING_DATABASE_URL;
    if (url) {
      return new DataSource({
        type: 'postgres',
        url,
        synchronize: false,
        logging: false,
      });
    }
    const host = process.env.STAGING_DB_HOST;
    const database = process.env.STAGING_DB_NAME;
    const username = process.env.STAGING_DB_USERNAME;
    if (!host || !database || !username) return null;
    return new DataSource({
      type: 'postgres',
      host,
      port: parseInt(process.env.STAGING_DB_PORT || '5432', 10),
      username,
      password: process.env.STAGING_DB_PASSWORD,
      database,
      synchronize: false,
      logging: false,
    });
  }

  async applyValidatedRecommendations(
    recommendations: IndexRecommendation[],
    validations: Array<{ sql: string; valid: boolean }>,
  ) {
    const applied: Array<{
      indexName: string;
      sql: string;
      appliedAt: string;
      dryRun: boolean;
    }> = [];
    const autoCreate = process.env.DB_INDEX_AUTO_CREATE === 'true';
    for (const rec of recommendations) {
      const validation = validations.find((v) => v.sql === rec.sql);
      if (!validation?.valid) continue;
      const indexName =
        rec.sql.match(
          /INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/i,
        )?.[1] || 'unknown_index';
      if (!autoCreate) {
        this.logger.log(
          `[IndexOptimization] Recommended (dry-run): ${rec.sql}`,
        );
        applied.push({
          indexName,
          sql: rec.sql,
          appliedAt: new Date().toISOString(),
          dryRun: true,
        });
        continue;
      }
      try {
        await this.dataSource.query(rec.sql);
        this.logger.log(`[IndexOptimization] Created index ${indexName}`);
        applied.push({
          indexName,
          sql: rec.sql,
          appliedAt: new Date().toISOString(),
          dryRun: false,
        });
      } catch (error: any) {
        this.logger.warn(
          `[IndexOptimization] Failed to create ${indexName}: ${error?.message}`,
        );
      }
    }
    return applied;
  }

  async runNightlyIndexOptimization(): Promise<IndexOptimizationReport> {
    const slowQueries = await this.getSlowQueries(100);
    const recommendations = this.recommendIndexesFromSlowQueries(
      slowQueries as any[],
    );
    const stagingValidation =
      await this.validateIndexesInStaging(recommendations);
    const appliedIndexes = await this.applyValidatedRecommendations(
      recommendations,
      stagingValidation,
    );
    this.lastReport = {
      generatedAt: new Date().toISOString(),
      analyzedQueries: slowQueries.length,
      slowQueries,
      recommendations,
      appliedIndexes,
      stagingValidation,
    };
    this.logger.log(
      `[IndexOptimization] Nightly run complete. queries=${slowQueries.length} recommendations=${recommendations.length}`,
    );
    return this.lastReport;
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleNightlyIndexOptimization() {
    try {
      await this.runNightlyIndexOptimization();
    } catch (error: any) {
      this.logger.error(
        'Nightly index optimization failed',
        error?.stack || error?.message,
      );
    }
  }

  @Cron(CronExpression.EVERY_WEEK)
  async handleWeeklyOptimizationReport() {
    try {
      const report =
        this.lastReport || (await this.runNightlyIndexOptimization());
      await this.emailWeeklyReport(report);
    } catch (error: any) {
      this.logger.error(
        'Weekly index optimization report failed',
        error?.stack || error?.message,
      );
    }
  }

  async emailWeeklyReport(report: IndexOptimizationReport) {
    const summary = {
      generatedAt: report.generatedAt,
      analyzedQueries: report.analyzedQueries,
      recommendations: report.recommendations.length,
      appliedOrDryRun: report.appliedIndexes.length,
      recipients: this.reportRecipients,
    };
    // Notification delivery is environment-specific; log structured report and
    // expose it via endpoint for ops/automation.
    this.logger.log(
      `[IndexOptimization] Weekly report ${JSON.stringify(summary)}`,
    );
    return summary;
  }

  getLastOptimizationReport() {
    return this.lastReport;
  }
}
