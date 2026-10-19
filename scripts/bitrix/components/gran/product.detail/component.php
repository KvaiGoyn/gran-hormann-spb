<?php
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true) {
    die();
}
require_once $_SERVER['DOCUMENT_ROOT'] . '/include/gran/runtime.php';
$arResult = gran_get_item('gran_products', (string)$arParams['ELEMENT_CODE']);
if (!$arResult) {
    http_response_code(404);
    define('ERROR_404', 'Y');
    return;
}
$arResult['RELATED'] = array();
foreach (gran_get_items('gran_products') as $related) {
    if ($related['fields']['CODE'] !== $arResult['fields']['CODE'] && count($arResult['RELATED']) < 3) {
        $arResult['RELATED'][] = $related;
    }
}
$this->includeComponentTemplate();
