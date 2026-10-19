<?php
require $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';
require_once $_SERVER['DOCUMENT_ROOT'] . '/include/gran/runtime.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function gran_tariff_response($body, $status = 200)
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$tariffs = gran_tariff_configuration();
if (!$tariffs) {
    gran_tariff_response(array('error' => 'Тарифы ещё не настроены в административной панели.'), 503);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    gran_tariff_response($tariffs);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    gran_tariff_response(array('error' => 'Метод не поддерживается.'), 405);
}
if (isset($_SERVER['HTTP_ORIGIN'])) {
    $originHost = parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST);
    $requestHost = isset($_SERVER['HTTP_HOST']) ? preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST']) : '';
    if (!$originHost || strcasecmp($originHost, $requestHost) !== 0) {
        gran_tariff_response(array('error' => 'Запросите расчёт со страницы сайта.'), 403);
    }
}
$length = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
if ($length > 8192) {
    gran_tariff_response(array('error' => 'Слишком большой запрос.'), 413);
}
$body = file_get_contents('php://input', false, null, 0, 8193);
if ($body === false || strlen($body) > 8192) {
    gran_tariff_response(array('error' => 'Некорректный размер запроса.'), 413);
}
$input = json_decode($body, true);
$quote = gran_calculate_price($input, $tariffs);
if (!$quote) {
    gran_tariff_response(array('error' => 'Проверьте размеры и выбранные варианты.'), 400);
}
gran_tariff_response($quote);
