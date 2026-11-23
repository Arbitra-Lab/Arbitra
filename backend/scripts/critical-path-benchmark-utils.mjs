export function parseArguments(args, defaultBaseUrl = 'http://localhost:5000') {
  const options = { baseUrl: defaultBaseUrl };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--') {
      continue;
    } else if (arg === '--baseline') {
      options.baselineFile = args[++index];
      if (!options.baselineFile || options.baselineFile.startsWith('--')) {
        throw new Error('--baseline requires a JSON file path');
      }
    } else if (arg.startsWith('--baseline=')) {
      options.baselineFile = arg.slice('--baseline='.length);
      if (!options.baselineFile) {
        throw new Error('--baseline requires a JSON file path');
      }
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional[0]) options.baseUrl = positional[0];
  return options;
}

export function prepareScenario(
  scenario,
  { token, allowMutations, environment = process.env },
) {
  if (!scenario.mutation) return {};
  if (!allowMutations) {
    return {
      skipReason: 'set BENCHMARK_ALLOW_MUTATIONS=true to enable writes',
    };
  }
  if (!token) return { skipReason: 'BENCHMARK_TOKEN is required for writes' };

  const payload = environment[scenario.payloadEnv];
  if (!payload) {
    return { skipReason: `${scenario.payloadEnv} is required for writes` };
  }
  try {
    return { body: JSON.stringify(JSON.parse(payload)) };
  } catch {
    throw new Error(`${scenario.payloadEnv} must contain valid JSON`);
  }
}

export function percentileFromHistogram(histogram, percentile) {
  const total = [...histogram.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) return null;

  const targetRank = Math.ceil(total * percentile);
  let samples = 0;
  for (const [value, count] of [...histogram.entries()].sort(
    ([left], [right]) => left - right,
  )) {
    samples += count;
    if (samples >= targetRank) return value;
  }
  return null;
}

export function evaluateResult(scenario, result) {
  const p95Ms = result.p95Ms ?? result.latency?.p95;
  const requests = result.requests?.total ?? 0;
  const errors = result.errors ?? 0;
  const timeouts = result.timeouts ?? 0;
  const non2xx = result.non2xx ?? 0;
  const failures = [];

  if (!Number.isFinite(p95Ms)) {
    failures.push('p95 latency is unavailable');
  } else if (p95Ms >= scenario.p95TargetMs) {
    failures.push(
      `p95 ${p95Ms}ms is not below target ${scenario.p95TargetMs}ms`,
    );
  }
  if (requests === 0) failures.push('no requests completed');
  if (errors > 0) failures.push(`${errors} request error(s)`);
  if (timeouts > 0) failures.push(`${timeouts} timeout(s)`);
  if (non2xx > 0) failures.push(`${non2xx} non-2xx response(s)`);

  return {
    id: scenario.id,
    name: scenario.name,
    method: scenario.method,
    path: scenario.path,
    p95TargetMs: scenario.p95TargetMs,
    p95Ms: Number.isFinite(p95Ms) ? p95Ms : null,
    requests,
    errors,
    timeouts,
    non2xx,
    statusCodes: result.statusCodeStats ?? {},
    status: failures.length === 0 ? 'passed' : 'failed',
    failures,
  };
}

export function compareWithBaseline(results, baseline, thresholdPercent = 10) {
  const baselineResults = new Map(
    (baseline.results ?? [])
      .filter((result) => result.id && Number.isFinite(result.p95Ms))
      .map((result) => [result.id, result]),
  );

  return results
    .filter((result) => Number.isFinite(result.p95Ms))
    .flatMap((result) => {
      const previous = baselineResults.get(result.id);
      if (!previous || previous.p95Ms <= 0) return [];

      const regressionPercent =
        ((result.p95Ms - previous.p95Ms) / previous.p95Ms) * 100;
      return [
        {
          id: result.id,
          baselineP95Ms: previous.p95Ms,
          currentP95Ms: result.p95Ms,
          regressionPercent: Number(regressionPercent.toFixed(2)),
          thresholdPercent,
          regressed: regressionPercent > thresholdPercent,
        },
      ];
    });
}

export function serializeTrend(report) {
  return `${JSON.stringify(report)}\n`;
}
