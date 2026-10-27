<?php
// Запуск: php tests/test.php  (сеть не нужна — ответы подменяются)
require __DIR__ . '/../api/core.php';

$ago = fn($d) => gmdate('c', time() - $d * 86400);
$hh = ['items' => [
    ['id' => '1', 'name' => 'Python dev', 'employer' => ['name' => 'A'], 'area' => ['name' => 'Москва'], 'schedule' => ['id' => 'remote'], 'alternate_url' => 'https://hh.ru/1', 'published_at' => $ago(2)],
    ['id' => '2', 'name' => 'Python dev', 'employer' => ['name' => 'B'], 'area' => ['name' => 'Казань'], 'schedule' => ['id' => 'fullDay'], 'alternate_url' => 'https://hh.ru/2', 'published_at' => $ago(3)],
    ['id' => '3', 'name' => 'Старая', 'employer' => ['name' => 'C'], 'area' => ['name' => 'Омск'], 'schedule' => ['id' => 'remote'], 'alternate_url' => 'https://hh.ru/3', 'published_at' => $ago(20)],
]];
$remotive = ['jobs' => [['id' => 9, 'title' => 'Python engineer', 'company_name' => 'R', 'candidate_required_location' => 'USA', 'url' => 'https://remotive.com/9', 'publication_date' => $ago(1)]]];

$fake = fn(array $routes) => function (array $reqs) use ($routes) {
    $out = [];
    foreach ($reqs as $k => $r) {
        $out[$k] = ['data' => null, 'error' => 'unexpected ' . $r['url']];
        foreach ($routes as $part => $body) {
            if (strpos($r['url'], $part) !== false) {
                $out[$k] = is_string($body) ? ['data' => null, 'error' => $body] : ['data' => $body, 'error' => null];
            }
        }
    }
    return $out;
};

$fails = 0;
function check(string $name, bool $ok): void {
    global $fails;
    echo ($ok ? 'ok   ' : 'FAIL ') . $name . "\n";
    if (!$ok) $fails++;
}
$urls = fn($r) => array_column($r['jobs'], 'url');

$t = $fake(['api.hh.ru' => $hh, 'remotive.com' => $remotive]);

$w = runSearch('python', ['hh'], false, 7, $t);
check('неделя: 2 вакансии, старая отсечена', $w['total'] === 2);
check('месяц: 3 вакансии', runSearch('python', ['hh'], false, 30, $t)['total'] === 3);

$r = runSearch('python', ['hh', 'remotive'], true, 7, $t);
$u = $urls($r); sort($u);
check('удалённая работа', $u === ['https://hh.ru/1', 'https://remotive.com/9']);
check('новые первыми', $r['jobs'][0]['url'] === 'https://remotive.com/9');

$e = runSearch('python', ['hh', 'remotive'], false, 30, $fake(['api.hh.ru' => $hh, 'remotive.com' => 'HTTP 503']));
$rem = array_values(array_filter($e['sources'], fn($s) => $s['id'] === 'remotive'))[0];
check('ошибка источника не ломает остальные', $e['total'] === 3 && !$rem['ok'] && strpos($rem['error'], '503') !== false);

$k = runSearch('python', ['jooble'], false, 7, $fake([]));
check('источник без ключа пропущен', !$k['sources'][0]['ok'] && strpos($k['sources'][0]['error'], 'JOOBLE_KEY') !== false);

try { runSearch('  ', [], false, 7, $fake([])); check('пустой запрос', false); }
catch (InvalidArgumentException $x) { check('пустой запрос', true); }

exit($fails ? 1 : 0);
