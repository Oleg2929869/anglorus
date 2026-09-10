<?php
declare(strict_types=1);
require __DIR__ . '/_state.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(['error' => 'method_not_allowed'], 405);
    exit;
}

$body = read_json_body();

$result = with_locked_state(function (array $state) use ($body) {
    foreach (OPTIONS as $key) {
        if (isset($body[$key]) && is_string($body[$key])) {
            $state['labels'][$key] = mb_substr($body[$key], 0, 200);
        }
    }
    return $state;
});

send_json($result);
