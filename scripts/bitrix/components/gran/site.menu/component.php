<?php
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true) {
    die();
}
require_once $_SERVER['DOCUMENT_ROOT'] . '/include/gran/runtime.php';
$variant = isset($arParams['VARIANT']) && $arParams['VARIANT'] === 'mobile' ? 'mobile' : 'desktop';
$arResult = array(
    'VARIANT' => $variant,
    'ITEMS' => gran_get_items('gran_menu'),
    'PRODUCTS' => gran_get_items('gran_products')
);
$this->includeComponentTemplate();
