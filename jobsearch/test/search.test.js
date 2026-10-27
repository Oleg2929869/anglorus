'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { search, listSources } = require('../lib/search');

const NOW = Date.now();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

// Подменяем сеть: ответы по подстроке URL.
function fakeHttp(routes) {
  return async (url) => {
    for (const [part, body] of Object.entries(routes)) {
      if (url.includes(part)) {
        if (body instanceof Error) throw body;
        return body;
      }
    }
    throw new Error('unexpected ' + url);
  };
}

const hhPayload = {
  items: [
    { id: '1', name: 'Python dev', employer: { name: 'A' }, area: { name: 'Москва' }, schedule: { id: 'remote' }, alternate_url: 'https://hh.ru/1', published_at: daysAgo(2) },
    { id: '2', name: 'Python dev', employer: { name: 'B' }, area: { name: 'Казань' }, schedule: { id: 'fullDay' }, alternate_url: 'https://hh.ru/2', published_at: daysAgo(3) },
    { id: '3', name: 'Старая', employer: { name: 'C' }, area: { name: 'Омск' }, schedule: { id: 'remote' }, alternate_url: 'https://hh.ru/3', published_at: daysAgo(20) },
  ],
};
const remotivePayload = {
  jobs: [{ id: 9, title: 'Python engineer', company_name: 'R', candidate_required_location: 'USA', url: 'https://remotive.com/9', publication_date: daysAgo(1) }],
};

test('неделя отсекает вакансии старше 7 дней, месяц оставляет', async () => {
  const http = fakeHttp({ 'api.hh.ru': hhPayload });
  const week = await search({ q: 'python', sourceIds: ['hh'], days: 7 }, {}, http);
  assert.deepStrictEqual(week.jobs.map((j) => j.url).sort(), ['https://hh.ru/1', 'https://hh.ru/2']);
  const month = await search({ q: 'python', sourceIds: ['hh'], days: 30 }, {}, http);
  assert.strictEqual(month.total, 3);
});

test('фильтр удалённой работы', async () => {
  const http = fakeHttp({ 'api.hh.ru': hhPayload, 'remotive.com': remotivePayload });
  const r = await search({ q: 'python', sourceIds: ['hh', 'remotive'], remote: true, days: 7 }, {}, http);
  assert.deepStrictEqual(r.jobs.map((j) => j.url).sort(), ['https://hh.ru/1', 'https://remotive.com/9']);
  assert.ok(r.jobs.every((j) => j.remote));
});

test('результаты отсортированы по дате, ошибка источника не ломает остальные', async () => {
  const http = fakeHttp({ 'api.hh.ru': hhPayload, 'remotive.com': new Error('HTTP 503') });
  const r = await search({ q: 'python', sourceIds: ['hh', 'remotive'], days: 30 }, {}, http);
  assert.strictEqual(r.jobs[0].url, 'https://hh.ru/1');
  const remotive = r.sources.find((s) => s.id === 'remotive');
  assert.strictEqual(remotive.ok, false);
  assert.match(remotive.error, /503/);
});

test('источники без ключа пропускаются с пояснением', async () => {
  const r = await search({ q: 'python', sourceIds: ['jooble'], days: 7 }, {}, fakeHttp({}));
  assert.strictEqual(r.sources[0].ok, false);
  assert.match(r.sources[0].error, /JOOBLE_KEY/);
  assert.strictEqual(listSources({}).find((s) => s.id === 'jooble').available, false);
  assert.strictEqual(listSources({ JOOBLE_KEY: 'x' }).find((s) => s.id === 'jooble').available, true);
});

test('удалённая вакансия без флага определяется по тексту, Arbeitnow фильтруется по ключевым словам', async () => {
  const http = fakeHttp({
    'arbeitnow.com': { data: [
      { slug: 'a', title: 'Python Developer', company_name: 'X', location: 'Berlin', remote: true, url: 'https://an/a', created_at: Math.floor((NOW - 86400000) / 1000), description: '' },
      { slug: 'b', title: 'Cook', company_name: 'Y', location: 'Berlin', remote: false, url: 'https://an/b', created_at: Math.floor((NOW - 86400000) / 1000), description: '' },
    ] },
  });
  const r = await search({ q: 'python', sourceIds: ['arbeitnow'], remote: true, days: 7 }, {}, http);
  assert.deepStrictEqual(r.jobs.map((j) => j.url), ['https://an/a']);
});

test('пустой запрос — ошибка 400', async () => {
  await assert.rejects(() => search({ q: '  ' }, {}, fakeHttp({})), (e) => e.status === 400);
});
