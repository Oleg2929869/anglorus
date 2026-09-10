<?php
declare(strict_types=1);

const OPTIONS = ['A', 'B', 'C'];
const STATE_FILE = __DIR__ . '/../data/state.json';

function default_state(): array {
    return [
        'round' => 1,
        'labels' => ['A' => '', 'B' => '', 'C' => ''],
        'votes' => ['A' => 0, 'B' => 0, 'C' => 0],
    ];
}

function normalize_state(array $raw): array {
    $default = default_state();
    return [
        'round' => isset($raw['round']) ? (int) $raw['round'] : $default['round'],
        'labels' => [
            'A' => isset($raw['labels']['A']) ? (string) $raw['labels']['A'] : '',
            'B' => isset($raw['labels']['B']) ? (string) $raw['labels']['B'] : '',
            'C' => isset($raw['labels']['C']) ? (string) $raw['labels']['C'] : '',
        ],
        'votes' => [
            'A' => isset($raw['votes']['A']) ? (int) $raw['votes']['A'] : 0,
            'B' => isset($raw['votes']['B']) ? (int) $raw['votes']['B'] : 0,
            'C' => isset($raw['votes']['C']) ? (int) $raw['votes']['C'] : 0,
        ],
    ];
}

function ensure_data_dir(): void {
    $dir = dirname(STATE_FILE);
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
}

function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

/**
 * Loads state, lets $mutator modify it, saves it back — all inside one
 * exclusive file lock so concurrent votes from many students don't race.
 */
function with_locked_state(callable $mutator): array {
    ensure_data_dir();
    $handle = fopen(STATE_FILE, 'c+');
    if ($handle === false) {
        http_response_code(500);
        exit(json_encode(['error' => 'storage_unavailable']));
    }
    flock($handle, LOCK_EX);

    $contents = stream_get_contents($handle);
    $state = default_state();
    if ($contents !== false && trim($contents) !== '') {
        $decoded = json_decode($contents, true);
        if (is_array($decoded)) {
            $state = normalize_state($decoded);
        }
    }

    $state = $mutator($state);

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);

    return $state;
}

function send_json(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
}
