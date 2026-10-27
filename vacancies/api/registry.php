<?php
require_once __DIR__ . '/lib.php';

/*
 * Источник: id, name, region, keys[], requests(ctx) -> [req...], parse(responses[], ctx) -> job[]
 * ctx: q, remote (bool), days (7|30|null), cfg (config.php)
 * Дата и «удалённая работа» дополнительно фильтруются в search.php.
 */
function getSources(): array {
    $cut = fn(?int $days) => $days ? time() - $days * DAY : null;
    $get = fn(string $url, array $headers = []) => [['url' => $url, 'headers' => $headers]];

    return [
        [
            'id' => 'hh', 'name' => 'HeadHunter (hh.ru)', 'region' => 'Россия/СНГ', 'keys' => [],
            'requests' => function ($c) use ($get) {
                $p = ['text' => $c['q'], 'per_page' => 50, 'order_by' => 'publication_time'];
                if ($c['days']) $p['period'] = $c['days'];
                if ($c['remote']) $p['schedule'] = 'remote';
                $h = $c['cfg']['HH_TOKEN'] ? ['Authorization: Bearer ' . $c['cfg']['HH_TOKEN']] : [];
                return $get('https://api.hh.ru/vacancies?' . http_build_query($p), $h);
            },
            'parse' => fn($r) => array_map(fn($v) => job([
                'id' => $v['id'], 'title' => $v['name'],
                'company' => $v['employer']['name'] ?? '', 'location' => $v['area']['name'] ?? '',
                'remote' => isset($v['schedule']['id']) ? $v['schedule']['id'] === 'remote' : null,
                'url' => $v['alternate_url'] ?? '', 'published' => toIso($v['published_at'] ?? null),
                'salary' => salary($v['salary']['from'] ?? null, $v['salary']['to'] ?? null, $v['salary']['currency'] ?? ''),
                'snippet' => snip(($v['snippet']['requirement'] ?? '') . ' ' . ($v['snippet']['responsibility'] ?? '')),
            ]), $r[0]['items'] ?? []),
        ],
        [
            'id' => 'trudvsem', 'name' => 'Работа России (trudvsem.ru)', 'region' => 'Россия', 'keys' => [],
            'requests' => fn($c) => $get('https://opendata.trudvsem.ru/api/v1/vacancies?' . http_build_query(['text' => $c['q'], 'limit' => 100, 'offset' => 0])),
            'parse' => fn($r) => array_map(function ($w) {
                $v = $w['vacancy'];
                $isRemote = preg_match('/удал[её]н|дистанц/iu', ($v['schedule'] ?? '') . ' ' . ($v['job-name'] ?? '')) ? true : null;
                return job([
                    'id' => $v['id'] ?? '', 'title' => $v['job-name'] ?? '',
                    'company' => $v['company']['name'] ?? '', 'location' => $v['region']['name'] ?? '',
                    'remote' => $isRemote, 'url' => $v['vac_url'] ?? '',
                    'published' => toIso($v['creation-date'] ?? null),
                    'salary' => salary($v['salary_min'] ?? null, $v['salary_max'] ?? null, 'руб.'),
                    'snippet' => snip($v['duty'] ?? ''),
                ]);
            }, $r[0]['results']['vacancies'] ?? []),
        ],
        [
            'id' => 'superjob', 'name' => 'SuperJob', 'region' => 'Россия', 'keys' => ['SUPERJOB_KEY'],
            'requests' => function ($c) use ($get, $cut) {
                $p = ['keyword' => $c['q'], 'count' => 50];
                if ($f = $cut($c['days'])) $p['date_published_from'] = $f;
                return $get('https://api.superjob.ru/2.0/vacancies/?' . http_build_query($p), ['X-Api-App-Id: ' . $c['cfg']['SUPERJOB_KEY']]);
            },
            'parse' => fn($r) => array_map(fn($v) => job([
                'id' => $v['id'], 'title' => $v['profession'] ?? '', 'company' => $v['firm_name'] ?? '',
                'location' => $v['town']['title'] ?? '', 'remote' => null, 'url' => $v['link'] ?? '',
                'published' => toIso($v['date_published'] ?? null),
                'salary' => salary($v['payment_from'] ?? null, $v['payment_to'] ?? null, $v['currency'] ?? ''),
                'snippet' => snip($v['candidat'] ?? ''),
            ]), $r[0]['objects'] ?? []),
        ],
        [
            'id' => 'jooble', 'name' => 'Jooble', 'region' => 'Россия/мир', 'keys' => ['JOOBLE_KEY'],
            'requests' => function ($c) use ($cut) {
                $body = ['keywords' => $c['remote'] ? $c['q'] . ' remote' : $c['q'], 'page' => '1'];
                if ($f = $cut($c['days'])) $body['datecreatedfrom'] = gmdate('Y-m-d', $f);
                $host = $c['cfg']['JOOBLE_HOST'] ?: 'jooble.org';
                return [['url' => "https://$host/api/" . $c['cfg']['JOOBLE_KEY'], 'method' => 'POST', 'body' => $body]];
            },
            'parse' => fn($r) => array_map(fn($v) => job([
                'id' => $v['id'] ?? '', 'title' => $v['title'] ?? '', 'company' => $v['company'] ?? '',
                'location' => $v['location'] ?? '', 'remote' => null, 'url' => $v['link'] ?? '',
                'published' => toIso($v['updated'] ?? null), 'salary' => $v['salary'] ?? '',
                'snippet' => snip($v['snippet'] ?? ''),
            ]), $r[0]['jobs'] ?? []),
        ],
        [
            'id' => 'adzuna', 'name' => 'Adzuna', 'region' => 'Мир', 'keys' => ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'],
            'requests' => function ($c) use ($get) {
                $p = ['app_id' => $c['cfg']['ADZUNA_APP_ID'], 'app_key' => $c['cfg']['ADZUNA_APP_KEY'],
                      'what' => $c['q'], 'results_per_page' => 50, 'sort_by' => 'date'];
                if ($c['remote']) $p['what_or'] = 'remote home-working';
                if ($c['days']) $p['max_days_old'] = $c['days'];
                $country = $c['cfg']['ADZUNA_COUNTRY'] ?: 'gb';
                return $get("https://api.adzuna.com/v1/api/jobs/$country/search/1?" . http_build_query($p));
            },
            'parse' => fn($r) => array_map(fn($v) => job([
                'id' => $v['id'] ?? '', 'title' => $v['title'] ?? '',
                'company' => $v['company']['display_name'] ?? '', 'location' => $v['location']['display_name'] ?? '',
                'remote' => null, 'url' => $v['redirect_url'] ?? '', 'published' => toIso($v['created'] ?? null),
                'salary' => salary(isset($v['salary_min']) ? round($v['salary_min']) : null, isset($v['salary_max']) ? round($v['salary_max']) : null),
                'snippet' => snip($v['description'] ?? ''),
            ]), $r[0]['results'] ?? []),
        ],
        [
            'id' => 'usajobs', 'name' => 'USAJOBS', 'region' => 'США (федеральные)', 'keys' => ['USAJOBS_KEY', 'USAJOBS_EMAIL'],
            'requests' => function ($c) use ($get) {
                $p = ['Keyword' => $c['q'], 'ResultsPerPage' => 50, 'SortField' => 'opendate', 'SortDirection' => 'desc'];
                if ($c['days']) $p['DatePosted'] = $c['days'];
                if ($c['remote']) $p['RemoteIndicator'] = 'True';
                return $get('https://data.usajobs.gov/api/search?' . http_build_query($p),
                    ['User-Agent: ' . $c['cfg']['USAJOBS_EMAIL'], 'Authorization-Key: ' . $c['cfg']['USAJOBS_KEY']]);
            },
            'parse' => function ($r, $c) {
                return array_map(function ($it) use ($c) {
                    $v = $it['MatchedObjectDescriptor'];
                    $pay = $v['PositionRemuneration'][0] ?? [];
                    return job([
                        'id' => $v['PositionID'] ?? '', 'title' => $v['PositionTitle'] ?? '',
                        'company' => $v['OrganizationName'] ?? '', 'location' => $v['PositionLocationDisplay'] ?? '',
                        'remote' => $c['remote'] ? true : null, 'url' => $v['PositionURI'] ?? '',
                        'published' => toIso($v['PublicationStartDate'] ?? null),
                        'salary' => salary((float)($pay['MinimumRange'] ?? 0) ?: null, (float)($pay['MaximumRange'] ?? 0) ?: null, 'USD'),
                        'snippet' => snip($v['QualificationSummary'] ?? ''),
                    ]);
                }, $r[0]['SearchResult']['SearchResultItems'] ?? []);
            },
        ],
        [
            'id' => 'jobtech', 'name' => 'JobTech / Platsbanken', 'region' => 'Швеция', 'keys' => [],
            'requests' => function ($c) use ($get, $cut) {
                $p = ['q' => $c['q'], 'limit' => 100, 'sort' => 'pubdate-desc'];
                if ($f = $cut($c['days'])) $p['published-after'] = gmdate('Y-m-d\TH:i:s', $f);
                if ($c['remote']) $p['remote'] = 'true';
                return $get('https://jobsearch.api.jobtechdev.se/search?' . http_build_query($p));
            },
            'parse' => fn($r, $c) => array_map(fn($v) => job([
                'id' => $v['id'] ?? '', 'title' => $v['headline'] ?? '', 'company' => $v['employer']['name'] ?? '',
                'location' => $v['workplace_address']['municipality'] ?? ($v['workplace_address']['region'] ?? ''),
                'remote' => $c['remote'] ? true : null,
                'url' => $v['webpage_url'] ?? ($v['application_details']['url'] ?? ''),
                'published' => toIso($v['publication_date'] ?? null), 'salary' => $v['salary_description'] ?? '',
                'snippet' => snip($v['description']['text'] ?? ''),
            ]), $r[0]['hits'] ?? []),
        ],
        [
            'id' => 'remotive', 'name' => 'Remotive', 'region' => 'Удалённая, мир', 'keys' => [],
            'requests' => fn($c) => $get('https://remotive.com/api/remote-jobs?' . http_build_query(['search' => $c['q'], 'limit' => 100])),
            'parse' => fn($r) => array_map(fn($v) => job([
                'id' => $v['id'] ?? '', 'title' => $v['title'] ?? '', 'company' => $v['company_name'] ?? '',
                'location' => $v['candidate_required_location'] ?? '', 'remote' => true, 'url' => $v['url'] ?? '',
                'published' => toIso($v['publication_date'] ?? null), 'salary' => $v['salary'] ?? '',
                'snippet' => snip($v['description'] ?? ''),
            ]), $r[0]['jobs'] ?? []),
        ],
        [
            'id' => 'remoteok', 'name' => 'Remote OK', 'region' => 'Удалённая, мир', 'keys' => [],
            'requests' => fn($c) => $get('https://remoteok.com/api'),
            'parse' => function ($r, $c) {
                $out = [];
                foreach ($r[0] as $v) {
                    if (!is_array($v) || empty($v['position'])) continue; // первый элемент — legal notice
                    if (!matchesQuery($c['q'], $v['position'], $v['company'] ?? '', implode(' ', $v['tags'] ?? []), $v['description'] ?? '')) continue;
                    $out[] = job([
                        'id' => $v['id'] ?? '', 'title' => $v['position'], 'company' => $v['company'] ?? '',
                        'location' => $v['location'] ?? '', 'remote' => true, 'url' => $v['url'] ?? '',
                        'published' => toIso($v['date'] ?? ($v['epoch'] ?? null)),
                        'salary' => salary($v['salary_min'] ?? null, $v['salary_max'] ?? null, 'USD'),
                        'snippet' => snip($v['description'] ?? ''),
                    ]);
                }
                return $out;
            },
        ],
        [
            'id' => 'jobicy', 'name' => 'Jobicy', 'region' => 'Удалённая, мир', 'keys' => [],
            'requests' => fn($c) => $get('https://jobicy.com/api/v2/remote-jobs?' . http_build_query(['count' => 50, 'tag' => $c['q']])),
            'parse' => fn($r) => array_map(fn($v) => job([
                'id' => $v['id'] ?? '', 'title' => $v['jobTitle'] ?? '', 'company' => $v['companyName'] ?? '',
                'location' => is_array($v['jobGeo'] ?? null) ? implode(', ', $v['jobGeo']) : ($v['jobGeo'] ?? ''),
                'remote' => true, 'url' => $v['url'] ?? '', 'published' => toIso($v['pubDate'] ?? null),
                'salary' => salary($v['salaryMin'] ?? null, $v['salaryMax'] ?? null, $v['salaryCurrency'] ?? ''),
                'snippet' => snip($v['jobExcerpt'] ?? ''),
            ]), $r[0]['jobs'] ?? []),
        ],
        [
            'id' => 'himalayas', 'name' => 'Himalayas', 'region' => 'Удалённая, мир', 'keys' => [],
            'requests' => fn($c) => $get('https://himalayas.app/jobs/api/search?' . http_build_query(['q' => $c['q'], 'sort' => 'recent'])),
            'parse' => fn($r) => array_map(fn($v) => job([
                'id' => $v['guid'] ?? ($v['applicationLink'] ?? ''), 'title' => $v['title'] ?? '',
                'company' => $v['companyName'] ?? '',
                'location' => !empty($v['locationRestrictions']) ? implode(', ', $v['locationRestrictions']) : 'Worldwide',
                'remote' => true, 'url' => $v['applicationLink'] ?? ($v['guid'] ?? ''),
                'published' => toIso($v['pubDate'] ?? null),
                'salary' => salary($v['minSalary'] ?? null, $v['maxSalary'] ?? null, $v['currency'] ?? ''),
                'snippet' => snip($v['excerpt'] ?? ($v['description'] ?? '')),
            ]), $r[0]['jobs'] ?? []),
        ],
        [
            'id' => 'arbeitnow', 'name' => 'Arbeitnow', 'region' => 'Германия/Европа', 'keys' => [],
            'requests' => fn($c) => array_map(fn($p) => ['url' => "https://www.arbeitnow.com/api/job-board-api?page=$p"], [1, 2, 3]),
            'parse' => function ($r, $c) {
                $out = [];
                foreach ($r as $page) {
                    foreach ($page['data'] ?? [] as $v) {
                        if (!matchesQuery($c['q'], $v['title'] ?? '', $v['company_name'] ?? '', implode(' ', $v['tags'] ?? []), $v['description'] ?? '')) continue;
                        $out[] = job([
                            'id' => $v['slug'] ?? '', 'title' => $v['title'] ?? '', 'company' => $v['company_name'] ?? '',
                            'location' => $v['location'] ?? '', 'remote' => !empty($v['remote']), 'url' => $v['url'] ?? '',
                            'published' => toIso($v['created_at'] ?? null), 'snippet' => snip($v['description'] ?? ''),
                        ]);
                    }
                }
                return $out;
            },
        ],
        [
            'id' => 'themuse', 'name' => 'The Muse', 'region' => 'США/мир', 'keys' => [],
            'requests' => fn($c) => array_map(function ($p) use ($c) {
                $q = ['page' => $p];
                if ($c['cfg']['MUSE_API_KEY']) $q['api_key'] = $c['cfg']['MUSE_API_KEY'];
                return ['url' => 'https://www.themuse.com/api/public/jobs?' . http_build_query($q)];
            }, [0, 1, 2]),
            'parse' => function ($r, $c) {
                $out = [];
                foreach ($r as $page) {
                    foreach ($page['results'] ?? [] as $v) {
                        if (!matchesQuery($c['q'], $v['name'] ?? '', $v['company']['name'] ?? '', $v['contents'] ?? '')) continue;
                        $locs = array_map(fn($l) => $l['name'] ?? '', $v['locations'] ?? []);
                        $out[] = job([
                            'id' => $v['id'] ?? '', 'title' => $v['name'] ?? '', 'company' => $v['company']['name'] ?? '',
                            'location' => implode(', ', $locs),
                            'remote' => preg_match('/flexible|remote/i', implode(' ', $locs)) ? true : null,
                            'url' => $v['refs']['landing_page'] ?? '', 'published' => toIso($v['publication_date'] ?? null),
                            'snippet' => snip($v['contents'] ?? ''),
                        ]);
                    }
                }
                return $out;
            },
        ],
    ];
}

function sourceAvailable(array $s): bool {
    foreach ($s['keys'] as $k) {
        if (empty(cfg()[$k])) return false;
    }
    return true;
}
