import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  compareWithBaseline,
  evaluateResult,
  parseArguments,
  percentileFromHistogram,
  prepareScenario,
  serializeTrend,
} from './critical-path-benchmark-utils.mjs';

const config = JSON.parse(
  await readFile(
    new URL('./critical-path-benchmark.config.json', import.meta.url),
    'utf8',
  ),
);

test('critical path configuration covers 10+ endpoints and required p95 budgets', () => {
  assert.ok(config.scenarios.length >= 10);
  assert.equal(
    new Set(config.scenarios.map(({ id }) => id)).size,
    config.scenarios.length,
  );
  assert.equal(
    config.scenarios.find(({ id }) => id === 'property-search').p95TargetMs,
    200,
  );
  assert.equal(
    config.scenarios.find(({ id }) => id === 'payment-submission').p95TargetMs,
    500,
  );
  assert.equal(
    config.scenarios.find(({ id }) => id === 'dispute-creation').p95TargetMs,
    300,
  );
});

test('endpoint results fail on exceeded p95, missing samples, and bad responses', () => {
  const scenario = {
    id: 'property-search',
    name: 'Property search',
    method: 'GET',
    path: '/api/search/properties',
    p95TargetMs: 200,
  };
  const passing = evaluateResult(scenario, {
    latency: { p95: 199 },
    requests: { total: 15 },
    errors: 0,
    timeouts: 0,
  });
  assert.equal(passing.status, 'passed');

  const failing = evaluateResult(scenario, {
    latency: { p95: 200 },
    requests: { total: 15 },
    errors: 1,
    timeouts: 0,
    non2xx: 2,
  });
  assert.equal(failing.status, 'failed');
  assert.equal(failing.failures.length, 3);

  assert.equal(
    evaluateResult(scenario, { requests: { total: 0 } }).status,
    'failed',
  );
});

test('p95 calculation uses nearest-rank latency samples without retaining each request', () => {
  const latencyCounts = new Map(
    Array.from({ length: 20 }, (_, index) => [index + 1, 1]),
  );
  assert.equal(percentileFromHistogram(latencyCounts, 0.95), 19);
  assert.equal(percentileFromHistogram(new Map(), 0.95), null);
});

test('baseline comparison flags only regressions strictly greater than 10%', () => {
  const comparisons = compareWithBaseline(
    [
      { id: 'at-limit', p95Ms: 110 },
      { id: 'over-limit', p95Ms: 111 },
      { id: 'new-scenario', p95Ms: 80 },
    ],
    {
      results: [
        { id: 'at-limit', p95Ms: 100 },
        { id: 'over-limit', p95Ms: 100 },
      ],
    },
  );

  assert.deepEqual(
    comparisons.map(({ id, regressed }) => [id, regressed]),
    [
      ['at-limit', false],
      ['over-limit', true],
    ],
  );
});

test('baseline CLI option does not replace the target URL', () => {
  assert.deepEqual(
    parseArguments(['--', 'http://api.test', '--baseline', 'before.json']),
    { baseUrl: 'http://api.test', baselineFile: 'before.json' },
  );
  assert.deepEqual(parseArguments(['--baseline=before.json']), {
    baseUrl: 'http://localhost:5000',
    baselineFile: 'before.json',
  });
  assert.throws(
    () => parseArguments(['--baseline']),
    /requires a JSON file path/,
  );
});

test('mutating scenarios require explicit opt-in, token, and valid JSON payload', () => {
  const scenario = {
    mutation: true,
    payloadEnv: 'PAYMENT_PAYLOAD',
  };
  const environment = { PAYMENT_PAYLOAD: '{"amount":1}' };
  assert.ok(
    prepareScenario(scenario, {
      token: 'test-token',
      allowMutations: false,
      environment,
    }).skipReason,
  );
  assert.ok(
    prepareScenario(scenario, {
      allowMutations: true,
      environment,
    }).skipReason,
  );
  assert.deepEqual(
    prepareScenario(scenario, {
      token: 'test-token',
      allowMutations: true,
      environment,
    }),
    { body: '{"amount":1}' },
  );
  assert.throws(
    () =>
      prepareScenario(scenario, {
        token: 'test-token',
        allowMutations: true,
        environment: { PAYMENT_PAYLOAD: 'not-json' },
      }),
    /must contain valid JSON/,
  );
});

test('trend records serialize as a single machine-readable JSONL entry', () => {
  const line = serializeTrend({ timestamp: '2026-11-23T00:00:00.000Z' });
  assert.equal(line.endsWith('\n'), true);
  assert.deepEqual(JSON.parse(line), {
    timestamp: '2026-11-23T00:00:00.000Z',
  });
});
