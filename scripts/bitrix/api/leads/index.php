<?php
require $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';
require_once $_SERVER['DOCUMENT_ROOT'] . '/include/gran/runtime.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function gran_lead_response($body, $status = 200)
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    gran_lead_response(array('error' => 'Метод не поддерживается.'), 405);
}
$origin = isset($_SERVER['HTTP_ORIGIN']) ? parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST) : '';
$host = isset($_SERVER['HTTP_HOST']) ? preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST']) : '';
if (!$origin || strcasecmp($origin, $host) !== 0 || (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && $_SERVER['HTTP_SEC_FETCH_SITE'] === 'cross-site')) {
    gran_lead_response(array('error' => 'Отправьте заявку со страницы сайта.'), 403);
}
if (stripos(isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '', 'application/json') !== 0) {
    gran_lead_response(array('error' => 'Некорректный формат заявки.'), 415);
}
if (isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > 8192) {
    gran_lead_response(array('error' => 'Слишком большой запрос.'), 413);
}
$raw = file_get_contents('php://input', false, null, 0, 8193);
if ($raw === false || strlen($raw) > 8192) {
    gran_lead_response(array('error' => 'Слишком большой запрос.'), 413);
}
$input = json_decode($raw, true);
if (!is_array($input) || isset($input[0])) {
    gran_lead_response(array('error' => 'Некорректная заявка.'), 400);
}
$name = isset($input['name']) && is_string($input['name']) ? trim($input['name']) : '';
$phone = isset($input['phone']) && is_string($input['phone']) ? trim($input['phone']) : '';
$message = isset($input['message']) && is_string($input['message']) ? trim($input['message']) : '';
$topic = isset($input['topic']) && is_string($input['topic']) ? trim($input['topic']) : 'Консультация';
$requestId = isset($input['requestId']) && is_string($input['requestId']) ? strtolower($input['requestId']) : '';
if (mb_strlen($name) < 2 || mb_strlen($name) > 80) {
    gran_lead_response(array('error' => 'Укажите имя от 2 до 80 символов.'), 400);
}
if (!preg_match('/^[+\d\s()\-]{10,30}$/u', $phone) || !preg_match('/^\d{10,15}$/', preg_replace('/\D/', '', $phone))) {
    gran_lead_response(array('error' => 'Проверьте номер телефона.'), 400);
}
if (mb_strlen($message) > 1500 || mb_strlen($topic) > 100) {
    gran_lead_response(array('error' => 'Сократите сообщение до допустимой длины.'), 400);
}
if (!isset($input['consent']) || $input['consent'] !== true) {
    gran_lead_response(array('error' => 'Нужно согласие на обработку данных заявки.'), 400);
}
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $requestId)) {
    gran_lead_response(array('error' => 'Обновите страницу и попробуйте ещё раз.'), 400);
}
if (!empty($input['website'])) {
    gran_lead_response(array('error' => 'Не удалось отправить заявку.'), 400);
}
$tariffs = gran_tariff_configuration();
if (!$tariffs) {
    gran_lead_response(array('error' => 'Тарифы ещё не настроены.'), 503);
}
$quote = null;
if (isset($input['configuration']) && $input['configuration'] !== null) {
    $quote = gran_calculate_price($input['configuration'], $tariffs);
    if (!$quote) {
        gran_lead_response(array('error' => 'Комплектация устарела. Пересчитайте стоимость и повторите отправку.'), 400);
    }
}
$leadBlockId = gran_iblock_id('gran_leads');
if (!$leadBlockId) {
    gran_lead_response(array('error' => 'Хранилище заявок не настроено.'), 503);
}
$lead = array('name' => $name, 'phone' => $phone, 'message' => $message, 'topic' => $topic, 'consent' => true, 'configuration' => $quote ? $quote['configuration'] : null, 'quote' => $quote);
$fingerprint = hash('sha256', json_encode($lead, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
$ipHash = hash('sha256', date('Y-m-d') . ':' . (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown'));
$lockPath = rtrim($_SERVER['DOCUMENT_ROOT'], '/') . '/upload/gran-leads.lock';
$lock = @fopen($lockPath, 'c');
if (!$lock || !flock($lock, LOCK_EX)) {
    gran_lead_response(array('error' => 'Хранилище заявок временно недоступно.'), 503);
}
try {
    $existing = CIBlockElement::GetList(array(), array('IBLOCK_ID' => $leadBlockId, '=PROPERTY_LEAD_ID' => $requestId), false, array('nTopCount' => 1), array('ID', 'PROPERTY_REQUEST_HASH'))->Fetch();
    if ($existing) {
        $existingHash = (string)$existing['PROPERTY_REQUEST_HASH_VALUE'];
        flock($lock, LOCK_UN);
        fclose($lock);
        if (hash_equals($existingHash, $fingerprint)) {
            gran_lead_response(array('id' => $requestId, 'status' => 'stored'));
        }
        gran_lead_response(array('error' => 'Этот номер запроса уже использован. Обновите страницу.'), 409);
    }
    $recent = CIBlockElement::GetList(
        array('ID' => 'DESC'),
        array('IBLOCK_ID' => $leadBlockId, '=PROPERTY_IP_HASH' => $ipHash, '>=DATE_CREATE' => date('d.m.Y H:i:s', time() - 3600)),
        false,
        array('nTopCount' => 8),
        array('ID')
    );
    if ($recent->SelectedRowsCount() >= 8) {
        flock($lock, LOCK_UN);
        fclose($lock);
        gran_lead_response(array('error' => 'Слишком много заявок. Попробуйте позже.'), 429);
    }
    $element = new CIBlockElement();
    $leadElementId = $element->Add(array(
        'IBLOCK_ID' => $leadBlockId,
        'ACTIVE' => 'Y',
        'NAME' => 'Заявка ' . strtoupper(substr($requestId, 0, 8)) . ' · ' . $name,
        'CODE' => 'lead-' . $requestId,
        'PREVIEW_TEXT' => $message,
        'PREVIEW_TEXT_TYPE' => 'text',
        'DETAIL_TEXT' => $quote ? json_encode($quote, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '',
        'DETAIL_TEXT_TYPE' => 'text',
        'PROPERTY_VALUES' => array(
            'LEAD_ID' => $requestId,
            'PHONE' => $phone,
            'TOPIC' => $topic,
            'IP_HASH' => $ipHash,
            'CONSENT_VERSION' => '2026-10-19',
            'REQUEST_HASH' => $fingerprint
        )
    ));
    if (!(int)$leadElementId) {
        throw new RuntimeException($element->LAST_ERROR);
    }
    flock($lock, LOCK_UN);
    fclose($lock);
    gran_lead_response(array('id' => $requestId, 'status' => 'stored'), 201);
} catch (Throwable $error) {
    flock($lock, LOCK_UN);
    fclose($lock);
    gran_lead_response(array('error' => 'Не удалось сохранить заявку. Данные формы остались на экране.'), 503);
}
