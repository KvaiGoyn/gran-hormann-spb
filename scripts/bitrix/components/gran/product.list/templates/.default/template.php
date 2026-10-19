<?php
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true) {
    die();
}
global $APPLICATION;
foreach ($arResult as $item) {
    $code = (string)$item['fields']['CODE'];
    if ($code === '') {
        continue;
    }
    $APPLICATION->IncludeComponent('gran:product.card', '', array('ELEMENT_CODE' => $code));
}
