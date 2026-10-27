<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/registry.php';

echo json_encode(array_map(fn($s) => [
    'id' => $s['id'], 'name' => $s['name'], 'region' => $s['region'],
    'available' => sourceAvailable($s), 'keys' => $s['keys'],
], getSources()), JSON_UNESCAPED_UNICODE);
