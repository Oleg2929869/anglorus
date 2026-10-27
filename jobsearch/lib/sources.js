'use strict';

const { DAY, toISO, snippet, matchesQuery, formatSalary, isoDate } = require('./util');

/*
 * Каждый источник: { id, name, region, keys: [ENV...], search(ctx) -> Job[] }
 * ctx = { q, remote, days, env, http }, где days — 7, 30 или null (без ограничения).
 * Job = { id, title, company, location, remote (true|false|null), url, published, salary, snippet }
 * Дата и «удалённая работа» дополнительно фильтруются на стороне сервера (lib/search.js),
 * поэтому адаптер может вернуть чуть больше, чем нужно.
 */

const cutoff = (days) => (days ? new Date(Date.now() - days * DAY) : null);

const sources = [
  {
    id: 'hh',
    name: 'HeadHunter (hh.ru)',
    region: 'Россия/СНГ',
    keys: [],
    async search({ q, remote, days, env, http }) {
      const params = new URLSearchParams({ text: q, per_page: '50', order_by: 'publication_time' });
      if (days) params.set('period', String(days)); // hh: дней, максимум 30
      if (remote) params.set('schedule', 'remote');
      const headers = env.HH_TOKEN ? { Authorization: `Bearer ${env.HH_TOKEN}` } : {};
      const data = await http(`https://api.hh.ru/vacancies?${params}`, { headers });
      return (data.items || []).map((v) => ({
        id: v.id,
        title: v.name,
        company: v.employer?.name,
        location: v.area?.name,
        remote: v.schedule ? v.schedule.id === 'remote' : null,
        url: v.alternate_url,
        published: toISO(v.published_at),
        salary: formatSalary(v.salary?.from, v.salary?.to, v.salary?.currency),
        snippet: snippet(`${v.snippet?.requirement || ''} ${v.snippet?.responsibility || ''}`),
      }));
    },
  },
  {
    id: 'trudvsem',
    name: 'Работа России (trudvsem.ru)',
    region: 'Россия',
    keys: [],
    async search({ q, http }) {
      const params = new URLSearchParams({ text: q, limit: '100', offset: '0' });
      const data = await http(`https://opendata.trudvsem.ru/api/v1/vacancies?${params}`);
      return (data.results?.vacancies || []).map(({ vacancy: v }) => ({
        id: v.id,
        title: v['job-name'],
        company: v.company?.name,
        location: v.region?.name || v.addresses?.address?.[0]?.location,
        remote: /удал[её]н|дистанц/i.test(`${v.schedule || ''} ${v['job-name'] || ''}`) || null,
        url: v.vac_url,
        published: toISO(v['creation-date']),
        salary: formatSalary(v.salary_min || null, v.salary_max || null, 'руб.'),
        snippet: snippet(v.duty),
      }));
    },
  },
  {
    id: 'superjob',
    name: 'SuperJob',
    region: 'Россия',
    keys: ['SUPERJOB_KEY'],
    async search({ q, days, env, http }) {
      const params = new URLSearchParams({ keyword: q, count: '50' });
      const from = cutoff(days);
      if (from) params.set('date_published_from', String(Math.floor(from.getTime() / 1000)));
      const data = await http(`https://api.superjob.ru/2.0/vacancies/?${params}`, {
        headers: { 'X-Api-App-Id': env.SUPERJOB_KEY },
      });
      return (data.objects || []).map((v) => ({
        id: v.id,
        title: v.profession,
        company: v.firm_name,
        location: v.town?.title,
        remote: null,
        url: v.link,
        published: toISO(v.date_published),
        salary: formatSalary(v.payment_from, v.payment_to, v.currency),
        snippet: snippet(v.candidat),
      }));
    },
  },
  {
    id: 'jooble',
    name: 'Jooble',
    region: 'Россия/мир',
    keys: ['JOOBLE_KEY'],
    async search({ q, remote, days, env, http }) {
      const host = env.JOOBLE_HOST || 'jooble.org';
      const body = { keywords: remote ? `${q} remote` : q, page: '1' };
      const from = cutoff(days);
      if (from) body.datecreatedfrom = isoDate(from);
      const data = await http(`https://${host}/api/${env.JOOBLE_KEY}`, {
        method: 'POST',
        body,
      });
      return (data.jobs || []).map((v) => ({
        id: v.id,
        title: v.title,
        company: v.company,
        location: v.location,
        remote: null,
        url: v.link,
        published: toISO(v.updated),
        salary: v.salary || '',
        snippet: snippet(v.snippet),
      }));
    },
  },
  {
    id: 'adzuna',
    name: 'Adzuna',
    region: 'Мир',
    keys: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'],
    async search({ q, remote, days, env, http }) {
      const country = env.ADZUNA_COUNTRY || 'gb';
      const params = new URLSearchParams({
        app_id: env.ADZUNA_APP_ID,
        app_key: env.ADZUNA_APP_KEY,
        what: q,
        results_per_page: '50',
        sort_by: 'date',
      });
      if (remote) params.set('what_or', 'remote home-working');
      if (days) params.set('max_days_old', String(days));
      const data = await http(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`);
      return (data.results || []).map((v) => ({
        id: v.id,
        title: v.title,
        company: v.company?.display_name,
        location: v.location?.display_name,
        remote: null,
        url: v.redirect_url,
        published: toISO(v.created),
        salary: formatSalary(v.salary_min && Math.round(v.salary_min), v.salary_max && Math.round(v.salary_max), ''),
        snippet: snippet(v.description),
      }));
    },
  },
  {
    id: 'usajobs',
    name: 'USAJOBS',
    region: 'США (федеральные)',
    keys: ['USAJOBS_KEY', 'USAJOBS_EMAIL'],
    async search({ q, remote, days, env, http }) {
      const params = new URLSearchParams({ Keyword: q, ResultsPerPage: '50', SortField: 'opendate', SortDirection: 'desc' });
      if (days) params.set('DatePosted', String(days));
      if (remote) params.set('RemoteIndicator', 'True');
      const data = await http(`https://data.usajobs.gov/api/search?${params}`, {
        headers: { 'User-Agent': env.USAJOBS_EMAIL, 'Authorization-Key': env.USAJOBS_KEY },
      });
      return (data.SearchResult?.SearchResultItems || []).map(({ MatchedObjectDescriptor: v }) => {
        const pay = v.PositionRemuneration?.[0] || {};
        return {
          id: v.PositionID,
          title: v.PositionTitle,
          company: v.OrganizationName,
          location: v.PositionLocationDisplay,
          remote: remote ? true : null,
          url: v.PositionURI,
          published: toISO(v.PublicationStartDate),
          salary: formatSalary(Number(pay.MinimumRange) || null, Number(pay.MaximumRange) || null, 'USD'),
          snippet: snippet(v.QualificationSummary),
        };
      });
    },
  },
  {
    id: 'jobtech',
    name: 'JobTech / Platsbanken',
    region: 'Швеция',
    keys: [],
    async search({ q, remote, days, http }) {
      const params = new URLSearchParams({ q, limit: '100', sort: 'pubdate-desc' });
      const from = cutoff(days);
      if (from) params.set('published-after', from.toISOString().slice(0, 19));
      if (remote) params.set('remote', 'true');
      const data = await http(`https://jobsearch.api.jobtechdev.se/search?${params}`);
      return (data.hits || []).map((v) => ({
        id: v.id,
        title: v.headline,
        company: v.employer?.name,
        location: v.workplace_address?.municipality || v.workplace_address?.region,
        remote: remote ? true : null,
        url: v.webpage_url || v.application_details?.url,
        published: toISO(v.publication_date),
        salary: v.salary_description || '',
        snippet: snippet(v.description?.text),
      }));
    },
  },
  {
    id: 'remotive',
    name: 'Remotive',
    region: 'Удалённая, мир',
    keys: [],
    async search({ q, http }) {
      const data = await http(`https://remotive.com/api/remote-jobs?${new URLSearchParams({ search: q, limit: '100' })}`);
      return (data.jobs || []).map((v) => ({
        id: v.id,
        title: v.title,
        company: v.company_name,
        location: v.candidate_required_location,
        remote: true,
        url: v.url,
        published: toISO(v.publication_date),
        salary: v.salary || '',
        snippet: snippet(v.description),
      }));
    },
  },
  {
    id: 'remoteok',
    name: 'Remote OK',
    region: 'Удалённая, мир',
    keys: [],
    async search({ q, http }) {
      const data = await http('https://remoteok.com/api');
      return (Array.isArray(data) ? data : [])
        .filter((v) => v.position && matchesQuery(q, v.position, v.company, (v.tags || []).join(' '), v.description))
        .map((v) => ({
          id: v.id,
          title: v.position,
          company: v.company,
          location: v.location,
          remote: true,
          url: v.url,
          published: toISO(v.date || v.epoch),
          salary: formatSalary(v.salary_min || null, v.salary_max || null, 'USD'),
          snippet: snippet(v.description),
        }));
    },
  },
  {
    id: 'jobicy',
    name: 'Jobicy',
    region: 'Удалённая, мир',
    keys: [],
    async search({ q, http }) {
      const data = await http(`https://jobicy.com/api/v2/remote-jobs?${new URLSearchParams({ count: '50', tag: q })}`);
      return (data.jobs || []).map((v) => ({
        id: v.id,
        title: v.jobTitle,
        company: v.companyName,
        location: Array.isArray(v.jobGeo) ? v.jobGeo.join(', ') : v.jobGeo,
        remote: true,
        url: v.url,
        published: toISO(v.pubDate),
        salary: formatSalary(v.salaryMin, v.salaryMax, v.salaryCurrency),
        snippet: snippet(v.jobExcerpt),
      }));
    },
  },
  {
    id: 'himalayas',
    name: 'Himalayas',
    region: 'Удалённая, мир',
    keys: [],
    async search({ q, http }) {
      const data = await http(`https://himalayas.app/jobs/api/search?${new URLSearchParams({ q, sort: 'recent' })}`);
      return (data.jobs || []).map((v) => ({
        id: v.guid || v.applicationLink || v.title,
        title: v.title,
        company: v.companyName,
        location: Array.isArray(v.locationRestrictions) && v.locationRestrictions.length ? v.locationRestrictions.join(', ') : 'Worldwide',
        remote: true,
        url: v.applicationLink || v.guid,
        published: toISO(v.pubDate),
        salary: formatSalary(v.minSalary, v.maxSalary, v.currency),
        snippet: snippet(v.excerpt || v.description),
      }));
    },
  },
  {
    id: 'arbeitnow',
    name: 'Arbeitnow',
    region: 'Германия/Европа',
    keys: [],
    async search({ q, http }) {
      const out = [];
      for (let page = 1; page <= 3; page++) {
        const data = await http(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
        const rows = data.data || [];
        for (const v of rows) {
          if (!matchesQuery(q, v.title, v.company_name, (v.tags || []).join(' '), v.description)) continue;
          out.push({
            id: v.slug,
            title: v.title,
            company: v.company_name,
            location: v.location,
            remote: Boolean(v.remote),
            url: v.url,
            published: toISO(v.created_at),
            salary: '',
            snippet: snippet(v.description),
          });
        }
        if (!rows.length) break;
      }
      return out;
    },
  },
  {
    id: 'themuse',
    name: 'The Muse',
    region: 'США/мир',
    keys: [],
    async search({ q, env, http }) {
      const out = [];
      for (let page = 0; page < 3; page++) {
        const params = new URLSearchParams({ page: String(page) });
        if (env.MUSE_API_KEY) params.set('api_key', env.MUSE_API_KEY);
        const data = await http(`https://www.themuse.com/api/public/jobs?${params}`);
        for (const v of data.results || []) {
          if (!matchesQuery(q, v.name, v.company?.name, v.contents)) continue;
          const locations = (v.locations || []).map((l) => l.name);
          out.push({
            id: v.id,
            title: v.name,
            company: v.company?.name,
            location: locations.join(', '),
            remote: locations.some((l) => /flexible|remote/i.test(l)) || null,
            url: v.refs?.landing_page,
            published: toISO(v.publication_date),
            salary: '',
            snippet: snippet(v.contents),
          });
        }
        if (page + 1 >= (data.page_count || 1)) break;
      }
      return out;
    },
  },
];

module.exports = { sources };
