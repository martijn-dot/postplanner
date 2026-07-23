import { performance } from 'node:perf_hooks';

const baseUrl = process.env.LOAD_TEST_SUPABASE_URL;
const anonKey = process.env.LOAD_TEST_SUPABASE_ANON_KEY;
const accessToken = process.env.LOAD_TEST_ACCESS_TOKEN;
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY ?? 20);
const iterations = Number(process.env.LOAD_TEST_ITERATIONS ?? 10);
const projectId = process.env.LOAD_TEST_PROJECT_ID;

if (!baseUrl || !anonKey || !accessToken) {
  console.error('Set LOAD_TEST_SUPABASE_URL, LOAD_TEST_SUPABASE_ANON_KEY, and LOAD_TEST_ACCESS_TOKEN.');
  process.exit(1);
}

const headers = {
  apikey: anonKey,
  Authorization: `Bearer ${accessToken}`,
};

const paths = [
  '/rest/v1/projects?select=id,name,last_edited_at&is_archived=eq.false&order=last_edited_at.desc&limit=50',
  '/rest/v1/profiles?select=id,display_name,role',
  '/rest/v1/project_presence?select=project_id,user_id,last_seen_at',
];

if (projectId) {
  const encoded = encodeURIComponent(projectId);
  paths.push(
    `/rest/v1/categories?select=*&project_id=eq.${encoded}&order=sort_order`,
    `/rest/v1/line_items?select=*&project_id=eq.${encoded}&order=sort_order`,
    `/rest/v1/asset_lists?select=*&project_id=eq.${encoded}&order=sort_order`,
    `/rest/v1/asset_list_rows?select=*&project_id=eq.${encoded}&order=sort_order`,
  );
}

const results = [];
async function request(path) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, { headers });
  await response.arrayBuffer();
  results.push({ duration: performance.now() - started, status: response.status });
}

const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const path = paths[(worker + iteration) % paths.length];
    await request(path);
  }
}));

const durations = results.map((result) => result.duration).sort((a, b) => a - b);
const percentile = (value) => durations[Math.min(durations.length - 1, Math.floor(durations.length * value))] ?? 0;
const failures = results.filter((result) => result.status < 200 || result.status >= 300);
const elapsed = performance.now() - started;

console.log(JSON.stringify({
  mode: 'authenticated read-only',
  concurrency,
  requests: results.length,
  failures: failures.length,
  statusCounts: Object.fromEntries([...new Set(results.map((result) => result.status))].map((status) => [status, results.filter((result) => result.status === status).length])),
  elapsedMs: Math.round(elapsed),
  requestsPerSecond: Number((results.length / (elapsed / 1000)).toFixed(2)),
  latencyMs: {
    p50: Math.round(percentile(0.50)),
    p95: Math.round(percentile(0.95)),
    p99: Math.round(percentile(0.99)),
    max: Math.round(durations.at(-1) ?? 0),
  },
}, null, 2));

if (failures.length) process.exitCode = 1;
