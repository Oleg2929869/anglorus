'use strict';

const REMOTE_RE = /remote|work from home|wfh|anywhere|distributed|удал[её]н|дистанц|на дому|из дома|fjärr|hjemmekontor|etä/i;

const DAY = 24 * 60 * 60 * 1000;

// Accepts ISO strings, unix seconds, unix milliseconds. Returns ISO string or null.
function toISO(value) {
  if (value === null || value === undefined || value === '') return null;
  let d;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const n = Number(value);
    d = new Date(n < 1e11 ? n * 1000 : n);
  } else {
    d = new Date(value);
  }
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function snippet(s, max = 280) {
  const t = stripHtml(s);
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function tokens(q) {
  return String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
}

// True when every keyword occurs somewhere in the haystack.
function matchesQuery(q, ...parts) {
  const hay = parts.join(' ').toLowerCase();
  return tokens(q).every((t) => hay.includes(t));
}

function formatSalary(min, max, currency) {
  const f = (n) => Number(n).toLocaleString('ru-RU');
  const cur = currency ? ' ' + currency : '';
  if (min && max) return `${f(min)}–${f(max)}${cur}`;
  if (min) return `от ${f(min)}${cur}`;
  if (max) return `до ${f(max)}${cur}`;
  return '';
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

module.exports = { REMOTE_RE, DAY, toISO, stripHtml, snippet, tokens, matchesQuery, formatSalary, isoDate };
