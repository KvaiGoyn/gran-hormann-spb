<?php
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true) {
    die();
}
$isMobile = $arResult['VARIANT'] === 'mobile';
?>
<nav class="<?=$isMobile ? 'mobile-menu' : 'desktop-nav'?>" aria-label="<?=$isMobile ? 'Мобильная навигация' : 'Основная навигация'?>"<?=$isMobile ? ' id="mobile-menu" hidden' : ''?>>
  <?php foreach ($arResult['ITEMS'] as $item):
    $code = (string)$item['fields']['CODE'];
    $title = htmlspecialcharsbx($item['fields']['NAME']);
    $url = htmlspecialcharsbx((string)gran_property_value($item['properties'], 'URL', '/'));
    $mobileOnly = (string)gran_property_value($item['properties'], 'MOBILE_ONLY', 'N') === 'Y';
    if (!$isMobile && $mobileOnly) {
        continue;
    }
    $editId = 'gran_menu_' . (int)$item['fields']['ID'];
    $this->AddEditAction($editId, (int)$item['fields']['ID'], CIBlock::GetArrayByID((int)$item['fields']['IBLOCK_ID'], 'ELEMENT_EDIT'));
    $this->AddDeleteAction($editId, (int)$item['fields']['ID'], CIBlock::GetArrayByID((int)$item['fields']['IBLOCK_ID'], 'ELEMENT_DELETE'), array('CONFIRM' => 'Удалить пункт меню?'));
    $editAreaId = htmlspecialcharsbx($this->GetEditAreaId($editId));
    if ($code === 'catalog'): ?>
      <div class="catalog-nav-group" id="<?=$editAreaId?>">
        <a class="catalog-nav-trigger" href="<?=$url?>"><?=$title?> <span class="tiny-plus">+</span></a>
        <?php if ($arResult['PRODUCTS']): ?><div class="catalog-nav-dropdown">
          <?php foreach ($arResult['PRODUCTS'] as $product):
            $productCode = preg_replace('/[^a-z0-9_-]/i', '', (string)$product['fields']['CODE']);
            if ($productCode === '') {
                continue;
            }
          ?>
            <a href="/catalog/?product=<?=rawurlencode($productCode)?>"><?=htmlspecialcharsbx($product['fields']['NAME'])?></a>
          <?php endforeach; ?>
        </div><?php endif; ?>
      </div>
    <?php else: ?>
      <a id="<?=$editAreaId?>" href="<?=$url?>"><?=$title?></a>
    <?php endif;
  endforeach; ?>
  <?php if ($isMobile): ?><button class="button button-yellow" data-config>Обсудить проект <span>↗</span></button><?php endif; ?>
</nav>
