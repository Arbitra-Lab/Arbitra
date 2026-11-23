#!/usr/bin/env node
/**
 * Focused p95 benchmark for critical API paths.
 * Mutating payment and dispute scenarios require an explicit opt-in and payloads.
 */
import autocannon from 'autocannon';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  compareWithBaseline,
  evaluateResult,
  parseArguments,
  percentileFromHistogram,
  prepareScenario,
  serializeTrend,
} from './critical-path-benchmark-utils.mjs';

const CONFIG_PATH = new URL(
  './critical-path-benchmark.config.json',
  import.meta.url,
);
const DEFAULT_OUTPUT_FILE = 'performance-report.json';
const DEFAULT_TRENDS_FILE = 'performance-trends.jsonl';

function runScenario(autocannonFn, baseUrl, scenario, options) {
  const url = `${baseUrl.replace(/\/$/, '')}${scenario.path}`;
  const headers = {};
  const responseLatencies = new Map();
  if (scenario.auth && options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (scenario.mutation) headers['Content-Type'] = 'application/json';

  return new Promise((resolve, reject) => {
    const instance = autocannonFn(
      {
        url,
        method: scenario.method,
        duration: options.duration,
        connections: options.connections,
        headers,
        body: options.body,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(
          evaluateResult(scenario, {
            ...result,
            p95Ms: percentileFromHistogram(responseLatencies, 0.95),
          }),
        );
      },
    );
    instance.on('response', (_client, _statusCode, _resBytes, responseTime) => {
      responseLatencies.set(
        responseTime,
        (responseLatencies.get(responseTime) ?? 0) + 1,
      );
    });
  });
}

async function loadConfig() {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  if (config.scenarios.length < 10) {
    throw new Error('The benchmark must define at least 10 endpoint scenarios');
  }
  return config;
}

async function loadBaseline(path) {
  if (!path) return null;
  const baseline = JSON.parse(await readFile(resolve(path), 'utf8'));
  if (!Array.isArray(baseline.results)) {
    throw new Error('Baseline JSON must contain a results array');
  }
  return baseline;
}

async function writeReports(report) {
  const reportPath = resolve(
    process.env.BENCHMARK_OUTPUT_FILE || DEFAULT_OUTPUT_FILE,
  );
  const trendsPath = resolve(
    process.env.BENCHMARK_TRENDS_FILE || DEFAULT_TRENDS_FILE,
  );
  await mkdir(dirname(reportPath), { recursive: true });
  await mkdir(dirname(trendsPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await appendFile(trendsPath, serializeTrend(report));
  console.log(`JSON report: ${reportPath}`);
  console.log(`Trend log:   ${trendsPath}`);
}

function printHelp() {
  console.log(`Usage: node scripts/critical-path-benchmark.mjs [BASE_URL] [--baseline FILE]

Environment:
  BASE_URL                         Target API (default: http://localhost:5000)
  BENCHMARK_TOKEN                  Bearer token for authenticated read scenarios
  BENCHMARK_DURATION                Seconds per endpoint (default: 3)
  BENCHMARK_CONNECTIONS             Concurrent requests (default: 5)
  BENCHMARK_ALLOW_MUTATIONS=true    Opt in to payment/dispute writes
  BENCHMARK_PAYMENT_PAYLOAD         JSON body for payment submission
  BENCHMARK_DISPUTE_PAYLOAD         JSON body for dispute creation
  BENCHMARK_BASELINE_FILE           Baseline JSON (alternative to --baseline)
  BENCHMARK_OUTPUT_FILE             JSON report (default: performance-report.json)
  BENCHMARK_TRENDS_FILE             Append-only JSONL trends (default: performance-trends.jsonl)`);
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(
    args,
    process.env.BASE_URL || 'http://localhost:5000',
  );
  if (options.help) {
    printHelp();
    return 0;
  }

  const config = await loadConfig();
  const duration = Number(process.env.BENCHMARK_DURATION || 3);
  const connections = Number(process.env.BENCHMARK_CONNECTIONS || 5);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('BENCHMARK_DURATION must be a positive number');
  }
  if (!Number.isInteger(connections) || connections <= 0) {
    throw new Error('BENCHMARK_CONNECTIONS must be a positive integer');
  }

  const baselineFile =
    options.baselineFile || process.env.BENCHMARK_BASELINE_FILE;
  const baseline = await loadBaseline(baselineFile);
  const token = process.env.BENCHMARK_TOKEN;
  const allowMutations = process.env.BENCHMARK_ALLOW_MUTATIONS === 'true';
  const results = [];

  console.log(`Benchmarking ${options.baseUrl} (${duration}s per endpoint)`);
  for (const scenario of config.scenarios) {
    const prepared = prepareScenario(scenario, { token, allowMutations });
    if (prepared.skipReason) {
      results.push({
        id: scenario.id,
        name: scenario.name,
        method: scenario.method,
        path: scenario.path,
        p95TargetMs: scenario.p95TargetMs,
        status: 'skipped',
        skipReason: prepared.skipReason,
      });
      console.log(`SKIP ${scenario.name}: ${prepared.skipReason}`);
      continue;
    }

    try {
      const result = await runScenario(autocannon, options.baseUrl, scenario, {
        duration,
        connections,
        token,
        body: prepared.body,
      });
      results.push(result);
      console.log(
        `${result.status.toUpperCase()} ${result.method} ${result.path}: ` +
          `p95=${result.p95Ms ?? 'n/a'}ms target=${result.p95TargetMs}ms ` +
          `requests=${result.requests}` +
          (result.failures.length ? ` (${result.failures.join(', ')})` : ''),
      );
    } catch (error) {
      results.push({
        id: scenario.id,
        name: scenario.name,
        method: scenario.method,
        path: scenario.path,
        p95TargetMs: scenario.p95TargetMs,
        p95Ms: null,
        requests: 0,
        errors: 0,
        timeouts: 0,
        status: 'failed',
        failures: [error.message],
      });
      console.error(`FAILED ${scenario.name}: ${error.message}`);
    }
  }

  const regressions = baseline
    ? compareWithBaseline(results, baseline, config.regressionThresholdPercent)
    : [];
  regressions
    .filter((comparison) => comparison.regressed)
    .forEach((comparison) => {
      const result = results.find(({ id }) => id === comparison.id);
      result.status = 'failed';
      result.failures.push(
        `p95 regression ${comparison.regressionPercent}% exceeds ` +
          `${comparison.thresholdPercent}% baseline threshold`,
      );
      console.error(
        `REGRESSION ${comparison.id}: ${comparison.regressionPercent}% ` +
          `(baseline ${comparison.baselineP95Ms}ms, current ${comparison.currentP95Ms}ms)`,
      );
    });

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: options.baseUrl,
    durationSecondsPerEndpoint: duration,
    connections,
    baselineFile: baselineFile || null,
    regressionThresholdPercent: config.regressionThresholdPercent,
    p95Calculation: 'nearest-rank response-event histogram (milliseconds)',
    passed: results.every(
      ({ status }) => status === 'passed' || status === 'skipped',
    ),
    results,
    regressions,
  };
  await writeReports(report);
  return report.passed ? 0 : 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  main().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error) => {
      console.error(`Benchmark failed: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
