<?php
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true) {
    die();
}

function gran_iblock_id($code)
{
    static $cache = array();
    if (isset($cache[$code])) {
        return $cache[$code];
    }
    if (!\Bitrix\Main\Loader::includeModule('iblock')) {
        return 0;
    }
    $row = CIBlock::GetList(array(), array('CODE' => $code, 'ACTIVE' => 'Y'))->Fetch();
    $cache[$code] = $row ? (int)$row['ID'] : 0;
    return $cache[$code];
}

function gran_item_properties($element)
{
    $properties = $element->GetProperties();
    return is_array($properties) ? $properties : array();
}

function gran_property_value($properties, $code, $default = '')
{
    if (!isset($properties[$code]['VALUE'])) {
        return $default;
    }
    $value = $properties[$code]['VALUE'];
    if (is_array($value)) {
        $values = array();
        foreach ($value as $entry) {
            $entryValue = is_array($entry) && isset($entry['VALUE']) ? $entry['VALUE'] : $entry;
            if ($entryValue !== '' && $entryValue !== null) {
                $values[] = $entryValue;
            }
        }
        return $values;
    }
    return $value === '' || $value === null ? $default : $value;
}

function gran_property_xml_id($properties, $code, $default = '')
{
    if (!isset($properties[$code]['VALUE_XML_ID'])) {
        return gran_property_value($properties, $code, $default);
    }
    $value = $properties[$code]['VALUE_XML_ID'];
    if (is_array($value)) {
        $value = reset($value);
    }
    return $value === '' || $value === null ? $default : $value;
}

function gran_get_item($iblockCode, $elementCode)
{
    $iblockId = gran_iblock_id($iblockCode);
    if (!$iblockId) {
        return null;
    }
    $result = CIBlockElement::GetList(
        array(),
        array('IBLOCK_ID' => $iblockId, '=CODE' => $elementCode, 'ACTIVE' => 'Y'),
        false,
        array('nTopCount' => 1),
        array('ID', 'IBLOCK_ID', 'NAME', 'CODE', 'SORT', 'PREVIEW_TEXT', 'DETAIL_TEXT', 'PREVIEW_PICTURE', 'DETAIL_PICTURE')
    );
    if (!$element = $result->GetNextElement()) {
        return null;
    }
    return array('fields' => $element->GetFields(), 'properties' => gran_item_properties($element));
}

function gran_get_items($iblockCode, $activeOnly = true)
{
    $iblockId = gran_iblock_id($iblockCode);
    if (!$iblockId) {
        return array();
    }
    $filter = array('IBLOCK_ID' => $iblockId);
    if ($activeOnly) {
        $filter['ACTIVE'] = 'Y';
    }
    $result = CIBlockElement::GetList(
        array('SORT' => 'ASC', 'ID' => 'ASC'),
        $filter,
        false,
        false,
        array('ID', 'IBLOCK_ID', 'NAME', 'CODE', 'SORT', 'PREVIEW_TEXT', 'DETAIL_TEXT', 'PREVIEW_PICTURE', 'DETAIL_PICTURE')
    );
    $items = array();
    while ($element = $result->GetNextElement()) {
        $items[] = array('fields' => $element->GetFields(), 'properties' => gran_item_properties($element));
    }
    return $items;
}

function gran_product_image($fields)
{
    $pictureId = !empty($fields['PREVIEW_PICTURE']) ? $fields['PREVIEW_PICTURE'] : $fields['DETAIL_PICTURE'];
    $path = $pictureId ? CFile::GetPath($pictureId) : '';
    return $path ? $path : '/bitrix/templates/gran/media/hormann-detail.webp';
}

function gran_render_product_card($item, $componentTemplate = null)
{
    $fields = $item['fields'];
    $properties = $item['properties'];
    $code = preg_replace('/[^a-z0-9_-]/i', '', (string)$fields['CODE']);
    if ($code === '') {
        return '';
    }
    $name = htmlspecialcharsbx($fields['NAME']);
    $category = htmlspecialcharsbx((string)gran_property_xml_id($properties, 'CATEGORY', 'home'));
    $tag = htmlspecialcharsbx((string)gran_property_value($properties, 'TAG', ''));
    $image = htmlspecialcharsbx(gran_product_image($fields));
    $editId = 'gran_product_' . (int)$fields['ID'];
    $editAreaId = '';
    if (is_object($componentTemplate)) {
        $componentTemplate->AddEditAction($editId, (int)$fields['ID'], CIBlock::GetArrayByID((int)$fields['IBLOCK_ID'], 'ELEMENT_EDIT'));
        $componentTemplate->AddDeleteAction($editId, (int)$fields['ID'], CIBlock::GetArrayByID((int)$fields['IBLOCK_ID'], 'ELEMENT_DELETE'), array('CONFIRM' => 'Удалить направление?'));
        $editAreaId = $componentTemplate->GetEditAreaId($editId);
    }
    $html = '<article class="product-card" id="' . htmlspecialcharsbx($editAreaId) . '" data-category="' . $category . '">';
    $html .= '<a href="/catalog/' . rawurlencode($code) . '/" aria-label="Подробнее: ' . $name . '"><div class="product-image"><img src="' . $image . '" alt="' . $name . ' Hörmann" loading="lazy" width="600" height="600"><span class="product-index">Hörmann</span></div><h3>' . $name . '<span aria-hidden="true">↗</span></h3><p>' . $tag . '</p></a>';
    $html .= '<button class="product-inquiry" data-lead="' . $name . '">Обсудить вариант <span aria-hidden="true">↗</span></button></article>';
    return $html;
}

function gran_apply_page_seo($pageCode)
{
    global $APPLICATION;
    $item = gran_get_item('gran_pages', $pageCode);
    if (!$item || !is_object($APPLICATION)) {
        return false;
    }
    $fields = $item['fields'];
    $props = $item['properties'];
    $title = (string)gran_property_value($props, 'META_TITLE', $fields['NAME']);
    $description = (string)gran_property_value($props, 'META_DESCRIPTION', '');
    if ($title !== '') {
        $APPLICATION->SetTitle($title);
    }
    if ($description !== '') {
        $APPLICATION->SetPageProperty('description', $description);
    }
    $canonical = (string)gran_property_value($props, 'CANONICAL', '');
    if ($canonical !== '') {
        $APPLICATION->SetPageProperty('canonical', $canonical);
    }
    return true;
}

function gran_tariff_configuration()
{
    $settings = gran_get_item('gran_tariff_settings', 'default');
    if (!$settings) {
        return null;
    }
    $props = $settings['properties'];
    $data = array(
        'version' => (string)gran_property_value($props, 'VERSION', 'custom'),
        'demo' => (string)gran_property_value($props, 'IS_DEMO', 'Y') === 'Y',
        'currency' => 'RUB',
        'series' => (string)gran_property_value($props, 'SERIES', 'Секционные ворота'),
        'base' => 0,
        'perSquareMeter' => 0,
        'installation' => 0,
        'colors' => array(),
        'surfaces' => array(),
        'drives' => array(),
        'delivery' => array()
    );
    foreach (gran_get_items('gran_tariffs') as $item) {
        $properties = $item['properties'];
        $key = preg_replace('/[^a-z0-9_-]/i', '', (string)gran_property_value($properties, 'TARIFF_KEY', $item['fields']['CODE']));
        $group = (string)gran_property_value($properties, 'TARIFF_GROUP', '');
        $label = (string)gran_property_value($properties, 'LABEL', $item['fields']['NAME']);
        $price = (int)round((float)gran_property_value($properties, 'PRICE', 0));
        if ($group === 'base') {
            $data['base'] = $price;
        } elseif ($group === 'perSquareMeter') {
            $data['perSquareMeter'] = $price;
        } elseif ($group === 'installation') {
            $data['installation'] = $price;
        } elseif (isset($data[$group]) && $key !== '') {
            $data[$group][$key] = array('label' => $label, 'price' => $price);
        }
    }
    foreach (array('colors', 'surfaces', 'drives', 'delivery') as $group) {
        if (!$data[$group]) {
            return null;
        }
    }
    return $data;
}

function gran_calculate_price($input, $tariffs)
{
    if (!is_array($input) || !isset($input['width'], $input['height'], $input['color'], $input['surface'], $input['drive'], $input['delivery']) || !isset($input['installation'])) {
        return null;
    }
    $width = filter_var($input['width'], FILTER_VALIDATE_INT);
    $height = filter_var($input['height'], FILTER_VALIDATE_INT);
    if ($width === false || $width < 2000 || $width > 6000 || $height === false || $height < 1800 || $height > 3500 || !is_bool($input['installation'])) {
        return null;
    }
    foreach (array('colors' => 'color', 'surfaces' => 'surface', 'drives' => 'drive', 'delivery' => 'delivery') as $table => $keyName) {
        if (!is_string($input[$keyName]) || !isset($tariffs[$table][$input[$keyName]])) {
            return null;
        }
    }
    $area = (int)round($width * $height * $tariffs['perSquareMeter'] / 1000000);
    $items = array(
        array('label' => 'Полотно и система · ' . $width . ' × ' . $height . ' мм', 'amount' => (int)$tariffs['base'] + $area),
        array('label' => $tariffs['colors'][$input['color']]['label'], 'amount' => (int)$tariffs['colors'][$input['color']]['price']),
        array('label' => $tariffs['surfaces'][$input['surface']]['label'], 'amount' => (int)$tariffs['surfaces'][$input['surface']]['price']),
        array('label' => $tariffs['drives'][$input['drive']]['label'], 'amount' => (int)$tariffs['drives'][$input['drive']]['price']),
        array('label' => $input['installation'] ? 'Стандартный монтаж' : 'Без монтажа', 'amount' => $input['installation'] ? (int)$tariffs['installation'] : 0),
        array('label' => $tariffs['delivery'][$input['delivery']]['label'], 'amount' => (int)$tariffs['delivery'][$input['delivery']]['price'])
    );
    $total = 0;
    foreach ($items as $item) {
        $total += $item['amount'];
    }
    return array(
        'configuration' => array('width' => $width, 'height' => $height, 'color' => $input['color'], 'surface' => $input['surface'], 'drive' => $input['drive'], 'installation' => $input['installation'], 'delivery' => $input['delivery']),
        'items' => $items,
        'price' => $total,
        'demo' => (bool)$tariffs['demo'],
        'currency' => 'RUB',
        'tariffVersion' => $tariffs['version']
    );
}
