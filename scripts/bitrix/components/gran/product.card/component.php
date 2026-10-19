<?php
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true) {
    die();
}
require_once $_SERVER['DOCUMENT_ROOT'] . '/include/gran/runtime.php';
$arResult = gran_get_item('gran_products', (string)$arParams['ELEMENT_CODE']);
if (!$arResult) {
    return;
}
$this->includeComponentTemplate();
