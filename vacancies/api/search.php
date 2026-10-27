<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/core.php';

$days = (int)($_GET['days'] ?? 0);
try {
    $result = runSearch(
        (string)($_GET['q'] ?? ''),
        array_values(array_filter(explode(',', (string)($_GET['sources'] ?? '')))),
        ($_GET['remote'] ?? '') === '1',
        in_array($days, [7, 30], true) ? $days : null
    );
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (InvalidArgumentException $e) {
    http_response_code(400);
    echo json_encode(['error' => $e->getMessage()]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
