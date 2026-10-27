<?php
// Общие функции: нормализация, HTTP (параллельный curl_multi), фильтры.

const REMOTE_RE = '/remote|work from home|wfh|anywhere|distributed|удал[её]н|дистанц|на дому|из дома|fjärr|hjemmekontor|etä/iu';
const DAY = 86400;

function cfg(): array {
    static $c = null;
    if ($c === null) {
        $c = require __DIR__ . '/../config.php';
    }
    return $c;
}

function toIso($v): ?string {
    if ($v === null || $v === '' || $v === false) return null;
    if (is_numeric($v)) {
        $n = (float)$v;
        $ts = $n > 1e11 ? (int)($n / 1000) : (int)$n;
    } else {
        $ts = strtotime((string)$v);
        if ($ts === false) return null;
    }
    return gmdate('c', $ts);
}

function snip($s, int $max = 280): string {
    $t = html_entity_decode(strip_tags((string)$s), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = trim(preg_replace('/\s+/u', ' ', $t));
    return mb_strlen($t) > $max ? rtrim(mb_substr($t, 0, $max - 1)) . '…' : $t;
}

function matchesQuery(string $q, string ...$parts): bool {
    $hay = mb_strtolower(implode(' ', $parts));
    foreach (preg_split('/\s+/u', mb_strtolower(trim($q))) as $t) {
        if ($t !== '' && mb_strpos($hay, $t) === false) return false;
    }
    return true;
}

function salary($min, $max, string $cur = ''): string {
    $f = fn($n) => number_format((float)$n, 0, ',', ' ');
    $cur = $cur !== '' ? " $cur" : '';
    if ($min && $max) return $f($min) . '–' . $f($max) . $cur;
    if ($min) return 'от ' . $f($min) . $cur;
    if ($max) return 'до ' . $f($max) . $cur;
    return '';
}

function job(array $a): array {
    return [
        'id' => (string)($a['id'] ?? ''),
        'title' => (string)($a['title'] ?? ''),
        'company' => (string)($a['company'] ?? ''),
        'location' => (string)($a['location'] ?? ''),
        'remote' => $a['remote'] ?? null,
        'url' => (string)($a['url'] ?? ''),
        'published' => $a['published'] ?? null,
        'salary' => (string)($a['salary'] ?? ''),
        'snippet' => (string)($a['snippet'] ?? ''),
    ];
}

/**
 * Выполняет все запросы параллельно.
 * $reqs: [key => ['url'=>, 'method'=>, 'headers'=>[], 'body'=>array|null]]
 * Возвращает [key => ['data'=>array|null, 'error'=>string|null]]
 */
function httpMulti(array $reqs): array {
    $mh = curl_multi_init();
    $handles = [];
    foreach ($reqs as $key => $r) {
        $ch = curl_init($r['url']);
        $headers = array_merge(['Accept: application/json', 'User-Agent: JobSearchApp/1.0'], $r['headers'] ?? []);
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_ENCODING => '',
        ];
        if (($r['method'] ?? 'GET') === 'POST') {
            $opts[CURLOPT_POST] = true;
            $opts[CURLOPT_POSTFIELDS] = json_encode($r['body'] ?? [], JSON_UNESCAPED_UNICODE);
            $headers[] = 'Content-Type: application/json';
        }
        $opts[CURLOPT_HTTPHEADER] = $headers;
        curl_setopt_array($ch, $opts);
        curl_multi_add_handle($mh, $ch);
        $handles[$key] = $ch;
    }
    do {
        $status = curl_multi_exec($mh, $running);
        if ($running) curl_multi_select($mh, 1.0);
    } while ($running && $status === CURLM_OK);

    $out = [];
    foreach ($handles as $key => $ch) {
        $body = curl_multi_getcontent($ch);
        $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err = curl_error($ch);
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
        if ($err !== '') {
            $out[$key] = ['data' => null, 'error' => $err];
        } elseif ($code < 200 || $code >= 300) {
            $out[$key] = ['data' => null, 'error' => "HTTP $code"];
        } else {
            $data = json_decode($body, true);
            $out[$key] = $data === null ? ['data' => null, 'error' => 'некорректный JSON'] : ['data' => $data, 'error' => null];
        }
    }
    curl_multi_close($mh);
    return $out;
}

function looksRemote(array $j): bool {
    if ($j['remote'] === true) return true;
    if ($j['remote'] === false) return false;
    return (bool)preg_match(REMOTE_RE, $j['title'] . ' ' . $j['location'] . ' ' . $j['snippet']);
}

function applyFilters(array $jobs, bool $remote, ?int $days): array {
    $from = $days ? time() - $days * DAY : null;
    $res = [];
    foreach ($jobs as $j) {
        if ($j['url'] === '' || $j['title'] === '') continue;
        if ($from && (!$j['published'] || strtotime($j['published']) < $from)) continue;
        $isRemote = looksRemote($j);
        if ($remote && !$isRemote) continue;
        $j['remote'] = $isRemote;
        $res[] = $j;
    }
    return $res;
}
