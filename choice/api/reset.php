<?php
declare(strict_types=1);
require __DIR__ . '/_state.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(['error' => 'method_not_allowed'], 405);
    exit;
}

$result = with_locked_state(function (array $state) {
    $state['round'] += 1;
    $state['votes'] = ['A' => 0, 'B' => 0, 'C' => 0];
    return $state;
});

send_json($result);
