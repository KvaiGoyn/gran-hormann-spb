<?php
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true || !$GLOBALS['USER']->IsAdmin()) {
    die('Forbidden');
}

function gran_install_require($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}

function gran_install_type($code)
{
    $res = CIBlockType::GetList(array(), array('ID' => $code));
    if ($res->Fetch()) {
        return;
    }
    $type = new CIBlockType();
    $ok = $type->Add(array(
        'ID' => $code,
        'SECTIONS' => 'Y',
        'IN_RSS' => 'N',
        'SORT' => 500,
        'LANG' => array(
            'ru' => array('NAME' => 'Контент сайта ГРАНЬ', 'SECTION_NAME' => 'Разделы', 'ELEMENT_NAME' => 'Элементы'),
            'en' => array('NAME' => 'Gran website content', 'SECTION_NAME' => 'Sections', 'ELEMENT_NAME' => 'Elements')
        )
    ));
    gran_install_require($ok, 'Не удалось создать тип инфоблоков: ' . $type->LAST_ERROR);
}

function gran_install_iblock($type, $code, $name, $publicRight)
{
    $row = CIBlock::GetList(array(), array('=CODE' => $code))->Fetch();
    if ($row) {
        return (int)$row['ID'];
    }
    $sites = array();
    $by = 'sort';
    $order = 'asc';
    $siteResult = CSite::GetList($by, $order, array('ACTIVE' => 'Y'));
    while ($site = $siteResult->Fetch()) {
        $sites[] = $site['LID'];
    }
    if (!$sites) {
        $sites[] = SITE_ID;
    }
    $block = new CIBlock();
    $id = $block->Add(array(
        'ACTIVE' => 'Y',
        'NAME' => $name,
        'CODE' => $code,
        'IBLOCK_TYPE_ID' => $type,
        'SITE_ID' => $sites,
        'SORT' => 500,
        'VERSION' => 2,
        'GROUP_ID' => array('1' => 'X', '2' => $publicRight)
    ));
    gran_install_require((int)$id > 0, 'Не удалось создать инфоблок ' . $code . ': ' . $block->LAST_ERROR);
    return (int)$id;
}

function gran_install_property($iblockId, $code, $name, $type = 'S', $multiple = 'N', $values = array())
{
    $res = CIBlockProperty::GetList(array(), array('IBLOCK_ID' => $iblockId, 'CODE' => $code));
    if ($res->Fetch()) {
        return;
    }
    $fields = array(
        'IBLOCK_ID' => $iblockId,
        'NAME' => $name,
        'ACTIVE' => 'Y',
        'SORT' => 500,
        'CODE' => $code,
        'PROPERTY_TYPE' => $type,
        'MULTIPLE' => $multiple,
        'IS_REQUIRED' => 'N'
    );
    if ($type === 'L') {
        foreach (array_values($values) as $index => $value) {
            $fields['VALUES'][] = array('VALUE' => $value['name'], 'XML_ID' => $value['id'], 'SORT' => ($index + 1) * 100);
        }
    }
    $property = new CIBlockProperty();
    $id = $property->Add($fields);
    gran_install_require((int)$id > 0, 'Не удалось создать свойство ' . $code . ': ' . $property->LAST_ERROR);
}

function gran_install_enum_id($iblockId, $propertyCode, $xmlId)
{
    $property = CIBlockProperty::GetList(array(), array('IBLOCK_ID' => $iblockId, 'CODE' => $propertyCode))->Fetch();
    if (!$property) {
        throw new RuntimeException('Не найдено свойство ' . $propertyCode);
    }
    $enum = CIBlockPropertyEnum::GetList(array(), array('PROPERTY_ID' => $property['ID'], 'XML_ID' => $xmlId))->Fetch();
    if (!$enum) {
        throw new RuntimeException('Не найден вариант ' . $xmlId . ' свойства ' . $propertyCode);
    }
    return (int)$enum['ID'];
}

function gran_install_find_element($iblockId, $elementCode)
{
    $result = CIBlockElement::GetList(
        array(),
        array('IBLOCK_ID' => $iblockId, 'CODE' => $elementCode),
        false,
        array('nTopCount' => 1),
        array('ID', 'IBLOCK_ID')
    );
    if (!$element = $result->GetNextElement()) {
        return null;
    }
    return array('fields' => $element->GetFields(), 'properties' => $element->GetProperties());
}

function gran_install_fill_missing_properties($iblockId, $elementId, $values, $existingProperties)
{
    $missing = array();
    foreach ($values as $code => $value) {
        $current = isset($existingProperties[$code]) && array_key_exists('VALUE', $existingProperties[$code])
            ? $existingProperties[$code]['VALUE']
            : false;
        if ($current === false || $current === null || $current === '' || $current === array()) {
            $missing[$code] = $value;
        }
    }
    if ($missing) {
        CIBlockElement::SetPropertyValuesEx($elementId, $iblockId, $missing);
    }
}

function gran_install_add_element($iblockId, $elementCode, $fields)
{
    $existing = gran_install_find_element($iblockId, $elementCode);
    if ($existing) {
        if (isset($fields['PROPERTY_VALUES']) && is_array($fields['PROPERTY_VALUES'])) {
            gran_install_fill_missing_properties($iblockId, (int)$existing['fields']['ID'], $fields['PROPERTY_VALUES'], $existing['properties']);
        }
        return (int)$existing['fields']['ID'];
    }
    $fields['IBLOCK_ID'] = $iblockId;
    $fields['ACTIVE'] = isset($fields['ACTIVE']) ? $fields['ACTIVE'] : 'Y';
    $element = new CIBlockElement();
    $id = $element->Add($fields);
    gran_install_require((int)$id > 0, 'Не удалось добавить элемент ' . $elementCode . ': ' . $element->LAST_ERROR);
    return (int)$id;
}

function gran_install_bitrix_content()
{
    if (!\Bitrix\Main\Loader::includeModule('iblock')) {
        throw new RuntimeException('Модуль «Информационные блоки» не установлен или отключён.');
    }
    $root = $_SERVER['DOCUMENT_ROOT'];
    $type = 'gran_hormann';
    gran_install_type($type);

    $productsId = gran_install_iblock($type, 'gran_products', 'ГРАНЬ: товары и направления', 'R');
    $pagesId = gran_install_iblock($type, 'gran_pages', 'ГРАНЬ: SEO страниц', 'R');
    $tariffsId = gran_install_iblock($type, 'gran_tariffs', 'ГРАНЬ: цены калькулятора', 'R');
    $settingsId = gran_install_iblock($type, 'gran_tariff_settings', 'ГРАНЬ: настройки цен', 'R');
    $leadsId = gran_install_iblock($type, 'gran_leads', 'ГРАНЬ: заявки сайта', 'E');

    gran_install_property($productsId, 'CATEGORY', 'Для кого', 'L', 'N', array(array('id' => 'home', 'name' => 'Для дома'), array('id' => 'business', 'name' => 'Для бизнеса')));
    gran_install_property($productsId, 'TAG', 'Короткая подпись');
    gran_install_property($productsId, 'SERIES', 'Серии', 'S', 'Y');
    gran_install_property($productsId, 'EXTERNAL_URL', 'Ссылка на каталог Hörmann');
    gran_install_property($pagesId, 'META_TITLE', 'Заголовок страницы');
    gran_install_property($pagesId, 'META_DESCRIPTION', 'Описание для поисковых систем');
    gran_install_property($pagesId, 'CANONICAL', 'Канонический URL');

    gran_install_property($tariffsId, 'TARIFF_GROUP', 'Раздел тарифа');
    gran_install_property($tariffsId, 'TARIFF_KEY', 'Код варианта');
    gran_install_property($tariffsId, 'LABEL', 'Подпись варианта');
    gran_install_property($tariffsId, 'PRICE', 'Цена, ₽', 'N');

    gran_install_property($settingsId, 'VERSION', 'Версия тарифа');
    gran_install_property($settingsId, 'IS_DEMO', 'Демонстрационный тариф (Y/N)');
    gran_install_property($settingsId, 'SERIES', 'Тип изделия');

    gran_install_property($leadsId, 'LEAD_ID', 'ID заявки');
    gran_install_property($leadsId, 'PHONE', 'Телефон');
    gran_install_property($leadsId, 'TOPIC', 'Тема обращения');
    gran_install_property($leadsId, 'IP_HASH', 'Хеш сетевого адреса');
    gran_install_property($leadsId, 'CONSENT_VERSION', 'Версия согласия');
    gran_install_property($leadsId, 'REQUEST_HASH', 'Хеш запроса');

    $products = json_decode(file_get_contents(__DIR__ . '/seed/products.json'), true);
    $pages = json_decode(file_get_contents(__DIR__ . '/seed/pages.json'), true);
    $tariffs = json_decode(file_get_contents(__DIR__ . '/seed/tariffs.json'), true);
    gran_install_require(is_array($products) && is_array($pages) && is_array($tariffs), 'Не удалось прочитать данные начального наполнения.');

    foreach ($products as $index => $product) {
        $picture = $root . '/bitrix/templates/gran/media/' . basename($product['image']);
        $detail = '<p>' . htmlspecialcharsbx($product['detail']) . '</p><p>Начните с размеров, пожеланий к внешнему виду и режима использования. Доступность моделей и вариантов отделки уточняется при согласовании.</p>';
        $fields = array(
            'NAME' => $product['title'],
            'CODE' => $product['id'],
            'SORT' => ($index + 1) * 100,
            'PREVIEW_TEXT' => $product['description'],
            'PREVIEW_TEXT_TYPE' => 'text',
            'DETAIL_TEXT' => $detail,
            'DETAIL_TEXT_TYPE' => 'html',
            'PROPERTY_VALUES' => array(
                'CATEGORY' => gran_install_enum_id($productsId, 'CATEGORY', $product['category']),
                'TAG' => $product['tag'],
                'SERIES' => $product['series'],
                'EXTERNAL_URL' => $product['url'],
                'PRICE_LABEL' => ''
            )
        );
        if (is_file($picture)) {
            $fields['PREVIEW_PICTURE'] = CFile::MakeFileArray($picture);
            $fields['DETAIL_PICTURE'] = CFile::MakeFileArray($picture);
        }
        gran_install_add_element($productsId, $product['id'], $fields);
    }

    $allProductsHaveBrokenBusinessCategory = count($products) > 0;
    $hasHomeProducts = false;
    foreach ($products as $product) {
        $existing = gran_install_find_element($productsId, $product['id']);
        $category = $existing && isset($existing['properties']['CATEGORY']['VALUE_XML_ID'])
            ? $existing['properties']['CATEGORY']['VALUE_XML_ID']
            : '';
        if (is_array($category)) {
            $category = reset($category);
        }
        if ($product['category'] === 'home') {
            $hasHomeProducts = true;
        }
        if ($category !== 'business') {
            $allProductsHaveBrokenBusinessCategory = false;
        }
    }
    if ($allProductsHaveBrokenBusinessCategory && $hasHomeProducts) {
        foreach ($products as $product) {
            if ($product['category'] !== 'home') {
                continue;
            }
            $existing = gran_install_find_element($productsId, $product['id']);
            CIBlockElement::SetPropertyValuesEx(
                (int)$existing['fields']['ID'],
                $productsId,
                array('CATEGORY' => gran_install_enum_id($productsId, 'CATEGORY', 'home'))
            );
        }
    }

    foreach ($pages as $page) {
        gran_install_add_element($pagesId, $page['code'], array(
            'NAME' => $page['title'],
            'CODE' => $page['code'],
            'PROPERTY_VALUES' => array('META_TITLE' => $page['title'], 'META_DESCRIPTION' => $page['description'], 'CANONICAL' => '')
        ));
    }

    gran_install_add_element($settingsId, 'default', array(
        'NAME' => 'Основные настройки калькулятора',
        'CODE' => 'default',
        'PROPERTY_VALUES' => array('VERSION' => $tariffs['version'], 'IS_DEMO' => $tariffs['demo'] ? 'Y' : 'N', 'SERIES' => $tariffs['series'])
    ));
    $rateRows = array(
        array('code' => 'price-base', 'group' => 'base', 'key' => 'base', 'label' => 'Базовая цена конструкции', 'price' => $tariffs['base']),
        array('code' => 'price-square-meter', 'group' => 'perSquareMeter', 'key' => 'perSquareMeter', 'label' => 'Цена за квадратный метр', 'price' => $tariffs['perSquareMeter']),
        array('code' => 'price-installation', 'group' => 'installation', 'key' => 'installation', 'label' => 'Стандартный монтаж', 'price' => $tariffs['installation'])
    );
    foreach (array('colors', 'surfaces', 'drives', 'delivery') as $group) {
        foreach ($tariffs[$group] as $key => $option) {
            $rateRows[] = array('code' => substr($group, 0, 3) . '-' . $key, 'group' => $group, 'key' => $key, 'label' => $option['label'], 'price' => $option['price']);
        }
    }
    foreach ($rateRows as $row) {
        gran_install_add_element($tariffsId, $row['code'], array(
            'NAME' => $row['label'],
            'CODE' => $row['code'],
            'PROPERTY_VALUES' => array('TARIFF_GROUP' => $row['group'], 'TARIFF_KEY' => $row['key'], 'LABEL' => $row['label'], 'PRICE' => (int)$row['price'])
        ));
    }
    return array(
        'products' => count($products),
        'pages' => count($pages),
        'tariffRows' => count($rateRows),
        'iblocks' => array($productsId, $pagesId, $tariffsId, $settingsId, $leadsId)
    );
}
