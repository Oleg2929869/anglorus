'use strict';

const $ = (id) => document.getElementById(id);
const form = $('form');
let sources = [];

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

function checked(name) {
  return form.querySelector(`input[name=${name}]:checked`).value;
}

function selectedSources() {
  return [...document.querySelectorAll('#sources input:checked')].map((i) => i.value);
}

function timeAgo(iso) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return `${days} дн. назад`;
}

async function loadSources() {
  sources = await (await fetch('/api/sources')).json();
  const box = $('sources');
  for (const s of sources) {
    const input = el('input', { type: 'checkbox', value: s.id, checked: s.available, disabled: !s.available });
    const label = el('label', { title: s.available ? s.region : `нужен ключ: ${s.keys.join(', ')}`, className: s.available ? '' : 'off' }, input, ` ${s.name}`);
    box.append(label);
  }
}

function setAll(on) {
  document.querySelectorAll('#sources input:not(:disabled)').forEach((i) => (i.checked = on));
}

function renderJob(j) {
  const tags = el('div', { className: 'tags' }, el('span', { className: 'tag' }, j.sourceName));
  if (j.remote) tags.append(el('span', { className: 'tag remote' }, 'удалённо'));
  if (j.salary) tags.append(el('span', { className: 'tag salary' }, j.salary));
  const meta = [j.company, j.location, j.published && timeAgo(j.published)].filter(Boolean).join(' · ');
  const item = el('li', { className: 'job' },
    el('h2', {}, el('a', { href: j.url, target: '_blank', rel: 'noopener noreferrer' }, j.title)),
    el('div', { className: 'meta' }, meta));
  if (j.snippet) item.append(el('p', {}, j.snippet));
  item.append(tags);
  return item;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const ids = selectedSources();
  if (!ids.length) { $('status').textContent = 'Выберите хотя бы один агрегатор.'; return; }

  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  $('status').textContent = 'Ищу…';
  $('results').replaceChildren();
  $('report').replaceChildren();

  const params = new URLSearchParams({ q: $('q').value, sources: ids.join(','), remote: checked('remote'), days: checked('days') });
  try {
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.status);
    $('status').textContent = data.total ? `Найдено вакансий: ${data.total}` : 'Ничего не найдено — попробуйте другие слова или более длинный период.';
    $('results').replaceChildren(...data.jobs.map(renderJob));
    $('report').replaceChildren(...data.sources.map((s) =>
      el('span', { className: `chip ${s.ok ? 'ok' : 'bad'}`, title: s.error || '' }, s.ok ? `${s.name}: ${s.count}` : `${s.name}: ${s.error}`)));
  } catch (err) {
    $('status').textContent = `Ошибка: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});

$('all').addEventListener('click', () => setAll(true));
$('none').addEventListener('click', () => setAll(false));
loadSources();
