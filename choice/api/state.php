<?php
declare(strict_types=1);
require __DIR__ . '/_state.php';

$state = with_locked_state(fn(array $s) => $s);
send_json($state);
