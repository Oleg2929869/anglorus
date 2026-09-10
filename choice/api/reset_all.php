<?php
declare(strict_types=1);
require __DIR__ . '/_state.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(['error' => 'method_not_allowed'], 405);
    exit;
}

$result = with_locked_state(fn(array $state) => default_state());

send_json($result);
