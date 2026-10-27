<?php
require_once __DIR__ . '/registry.php';

/**
 * $transport — функция httpMulti (подменяется в тестах).
 */
function runSearch(string $q, array $ids, bool $remote, ?int $days, callable $transport = null): array {
    $transport = $transport ?? 'httpMulti';
    $q = trim($q);
    if ($q === '') throw new InvalidArgumentException('empty_query');

    $ctx = ['q' => $q, 'remote' => $remote, 'days' => $days, 'cfg' => cfg()];
    $chosen = array_values(array_filter(getSources(), fn($s) => !$ids || in_array($s['id'], $ids, true)));

    $meta = [];
    $reqs = [];
    foreach ($chosen as $s) {
        if (!sourceAvailable($s)) {
            $meta[$s['id']] = ['id' => $s['id'], 'name' => $s['name'], 'ok' => false, 'count' => 0,
                'error' => 'нужен ключ: ' . implode(', ', $s['keys'])];
            continue;
        }
        foreach ($s['requests']($ctx) as $i => $r) $reqs[$s['id'] . '#' . $i] = $r;
    }

    $responses = $reqs ? $transport($reqs) : [];
    $all = [];
    foreach ($chosen as $s) {
        if (isset($meta[$s['id']])) continue;
        $datas = [];
        $errors = [];
        foreach ($responses as $key => $resp) {
            if (strpos($key, $s['id'] . '#') !== 0) continue;
            if ($resp['error'] !== null) $errors[] = $resp['error']; else $datas[] = $resp['data'];
        }
        if (!$datas) {
            $meta[$s['id']] = ['id' => $s['id'], 'name' => $s['name'], 'ok' => false, 'count' => 0, 'error' => $errors[0] ?? 'нет ответа'];
            continue;
        }
        try {
            $jobs = applyFilters($s['parse']($datas, $ctx), $remote, $days);
        } catch (Throwable $e) {
            $meta[$s['id']] = ['id' => $s['id'], 'name' => $s['name'], 'ok' => false, 'count' => 0, 'error' => 'формат ответа: ' . $e->getMessage()];
            continue;
        }
        foreach ($jobs as $j) $all[] = $j + ['source' => $s['id'], 'sourceName' => $s['name']];
        $meta[$s['id']] = ['id' => $s['id'], 'name' => $s['name'], 'ok' => true, 'count' => count($jobs)];
    }

    $seen = [];
    $all = array_values(array_filter($all, function ($j) use (&$seen) {
        if (isset($seen[$j['url']])) return false;
        return $seen[$j['url']] = true;
    }));
    usort($all, fn($a, $b) => strtotime($b['published'] ?? '') <=> strtotime($a['published'] ?? ''));

    return ['query' => $q, 'total' => count($all), 'jobs' => $all, 'sources' => array_values($meta)];
}
