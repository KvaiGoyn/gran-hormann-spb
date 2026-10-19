<?php
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true) {
    die();
}
$fields = $arResult['fields'];
$properties = $arResult['properties'];
$name = htmlspecialcharsbx($fields['NAME']);
$category = (string)gran_property_xml_id($properties, 'CATEGORY', 'home');
$tag = htmlspecialcharsbx((string)gran_property_value($properties, 'TAG', ''));
$description = htmlspecialcharsbx((string)$fields['PREVIEW_TEXT']);
$detail = (string)$fields['DETAIL_TEXT'];
$externalUrl = (string)gran_property_value($properties, 'EXTERNAL_URL', '');
$series = gran_property_value($properties, 'SERIES', array());
$image = htmlspecialcharsbx(gran_product_image($fields));
$code = rawurlencode((string)$fields['CODE']);
$editId = 'gran_product_' . (int)$fields['ID'];
$this->AddEditAction($editId, (int)$fields['ID'], CIBlock::GetArrayByID((int)$fields['IBLOCK_ID'], 'ELEMENT_EDIT'));
$this->AddDeleteAction($editId, (int)$fields['ID'], CIBlock::GetArrayByID((int)$fields['IBLOCK_ID'], 'ELEMENT_DELETE'), array('CONFIRM' => 'Удалить направление?'));
?>
<section class="product-page section-wrap" id="<?=$this->GetEditAreaId($editId)?>">
  <nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="/">Главная</a><span>/</span><a href="/catalog/">Каталог</a><span>/</span><span><?=$name?></span></nav>
  <div class="product-hero-layout">
    <div class="product-hero-image"><img src="<?=$image?>" alt="<?=$name?> Hörmann"><span>Hörmann · <?=$category === 'business' ? 'Для бизнеса' : 'Для вашего дома'?></span></div>
    <div class="product-hero-copy"><p class="section-kicker"><?=$tag?></p><h1><?=$name?></h1><p><?=$description?></p>
      <?php if (is_array($series) && $series): ?><div class="series-list"><?php foreach ($series as $seriesName): ?><span><?=htmlspecialcharsbx($seriesName)?></span><?php endforeach; ?></div><?php endif; ?>
      <div class="product-actions">
        <?php if ($code === 'garage'): ?><a class="button button-yellow" href="/calculator/">Рассчитать стоимость <span>↗</span></a><?php else: ?><button class="button button-yellow" data-lead="<?=$name?>">Обсудить решение <span>↗</span></button><?php endif; ?>
        <?php if (preg_match('#^https://www\.hoermann\.ru/#', $externalUrl)): ?><a class="text-link" href="<?=htmlspecialcharsbx($externalUrl)?>" target="_blank" rel="noopener noreferrer">Каталог производителя ↗</a><?php endif; ?>
      </div>
    </div>
  </div>
</section>
<section class="product-details section-wrap"><h2>Под ваш проект.<br>До каждой детали.</h2><div><?=$detail !== '' ? $detail : '<p>' . $description . '</p>'?><button class="text-link" data-lead="<?=$name?>">Помогите с выбором ↗</button></div></section>
<?php if ($arResult['RELATED']): ?><section class="related section-wrap"><p class="section-kicker">Продолжите знакомство</p><div class="related-links"><?php foreach ($arResult['RELATED'] as $related): ?><a href="/catalog/<?=rawurlencode($related['fields']['CODE'])?>/"><span><?=htmlspecialcharsbx($related['fields']['NAME'])?></span><span>↗</span></a><?php endforeach; ?></div></section><?php endif; ?>
