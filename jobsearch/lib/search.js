'use strict';

const { REMOTE_RE, DAY } = require('./util');
const { sources } = require('./sources');

const TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

async function http(url, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'User-Agent': 'JobSearchApp/1.0',
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function isConfigured(source, env) {
  return source.keys.every((k) => env[k]);
}

function listSources(env) {
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    region: s.region,
    available: isConfigured(s, env),
    keys: s.keys,
  }));
}

function looksRemote(job) {
  if (job.remote === true) return true;
  if (job.remote === false) return false;
  return REMOTE_RE.test(`${job.title} ${job.location} ${job.snippet}`);
}

function applyFilters(jobs, { remote, days }) {
  const from = days ? Date.now() - days * DAY : null;
  return jobs
    .filter((j) => j.url && j.title)
    // вакансии без даты не отбрасываем только если период не задан
    .filter((j) => (from ? j.published && Date.parse(j.published) >= from : true))
    .filter((j) => (remote ? looksRemote(j) : true))
    .map((j) => ({ ...j, remote: looksRemote(j) }));
}

async function runSource(source, ctx) {
  const started = Date.now();
  try {
    const raw = await source.search(ctx);
    const jobs = applyFilters(raw, ctx).map((j) => ({ ...j, source: source.id, sourceName: source.name }));
    return { id: source.id, name: source.name, ok: true, count: jobs.length, ms: Date.now() - started, jobs };
  } catch (err) {
    return { id: source.id, name: source.name, ok: false, error: err.message, count: 0, ms: Date.now() - started, jobs: [] };
  }
}

async function search({ q, sourceIds, remote = false, days = null }, env = process.env, httpImpl = http) {
  const query = String(q || '').trim();
  if (!query) throw Object.assign(new Error('empty_query'), { status: 400 });

  const chosen = sources.filter((s) => !sourceIds?.length || sourceIds.includes(s.id));
  const active = chosen.filter((s) => isConfigured(s, env));
  const skipped = chosen
    .filter((s) => !isConfigured(s, env))
    .map((s) => ({ id: s.id, name: s.name, ok: false, error: `нужен ключ: ${s.keys.join(', ')}`, count: 0, jobs: [] }));

  const cacheKey = JSON.stringify([query, active.map((s) => s.id), remote, days]);
  const hit = cache.get(cacheKey);
  if (hit && hit.at > Date.now() - CACHE_TTL_MS && httpImpl === http) return hit.value;

  const ctx = { q: query, remote, days, env, http: httpImpl };
  const results = await Promise.all(active.map((s) => runSource(s, ctx)));

  const seen = new Set();
  const jobs = results
    .flatMap((r) => r.jobs)
    .filter((j) => (seen.has(j.url) ? false : seen.add(j.url)))
    .sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));

  const value = {
    query,
    total: jobs.length,
    jobs,
    sources: [...results, ...skipped].map(({ jobs: _omit, ...meta }) => meta),
  };
  if (httpImpl === http) cache.set(cacheKey, { at: Date.now(), value });
  return value;
}

module.exports = { search, listSources, applyFilters, looksRemote };
