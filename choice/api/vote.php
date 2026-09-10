<?php
declare(strict_types=1);
require __DIR__ . '/_state.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(['error' => 'method_not_allowed'], 405);
    exit;
}

$body = read_json_body();
$option = $body['option'] ?? null;
$round = isset($body['round']) ? (int) $body['round'] : null;

if (!in_array($option, OPTIONS, true)) {
    send_json(['error' => 'invalid_option'], 400);
    exit;
}

$mismatch = false;
$result = with_locked_state(function (array $state) use ($option, $round, &$mismatch) {
    if ($round !== $state['round']) {
        $mismatch = true;
        return $state;
    }
    $state['votes'][$option] += 1;
    return $state;
});

if ($mismatch) {
    send_json(['error' => 'round_mismatch', 'state' => $result], 409);
    exit;
}

send_json($result);
