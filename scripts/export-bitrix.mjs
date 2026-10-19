import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { products } from '../src/products.js';

const pages = JSON.parse(await readFile('generated/pages.json', 'utf8'));
const out = 'release/bitrix';
const template = `${out}/bitrix/templates/gran`;
await rm(out, { recursive: true, force: true });
await mkdir(template, { recursive: true });

const rewrite = html => html
  .replaceAll('/site/', '/bitrix/templates/gran/')
  .replaceAll('/api/leads', '/api/leads/index.php');
const includeCall = path => `<?php $APPLICATION->IncludeComponent("bitrix:main.include", "", ["AREA_FILE_SHOW" => "file", "PATH" => "${path}"]); ?>`;
const phpArray = values => `[${Object.entries(values).map(([key, value]) => `"${key}" => "${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(', ')}]`;
const componentCall = (name, params) => `<?php $APPLICATION->IncludeComponent("${name}", "", ${phpArray(params)}); ?>`;
const writeArea = async (path, html) => {
  const file = out + path;
  await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  await writeFile(file, html.trim() + '\n');
};

function splitSections(markup) {
  const tags = [...markup.matchAll(/<\/?section\b[^>]*>/gi)];
  if (!tags.length) return markup.trim() ? [markup.trim()] : [];
  const chunks = [];
  let depth = 0;
  let cursor = 0;
  let sectionStart = -1;
  for (const tag of tags) {
    const closing = tag[0].startsWith('</');
    if (!closing && depth === 0) {
      const before = markup.slice(cursor, tag.index);
      if (before.trim()) chunks.push(before.trim());
      sectionStart = tag.index;
    }
    depth += closing ? -1 : 1;
    assert.ok(depth >= 0, 'Unexpected closing section tag');
    if (closing && depth === 0) {
      chunks.push(markup.slice(sectionStart, tag.index + tag[0].length).trim());
      cursor = tag.index + tag[0].length;
    }
  }
  assert.equal(depth, 0, 'Unclosed section tag');
  const after = markup.slice(cursor);
  if (after.trim()) chunks.push(after.trim());
  return chunks;
}

function areaName(markup, index) {
  const className = markup.match(/^<section\b[^>]*\bclass="([^"]+)"/i)?.[1]?.split(/\s+/)[0] ?? 'content';
  const readable = className.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'content';
  return `${String(index + 1).padStart(2, '0')}-${readable}`;
}

let areaCount = 2;
let productListComponentCount = 0;
function externalizeProductGrid(markup) {
  const gridAttribute = markup.indexOf('id="product-grid"');
  if (gridAttribute < 0) return markup;
  const gridStart = markup.lastIndexOf('<div', gridAttribute);
  const gridOpenEnd = markup.indexOf('>', gridAttribute) + 1;
  const sectionEnd = markup.indexOf('</section>', gridAttribute);
  const gridEnd = markup.lastIndexOf('</div>', sectionEnd);
  assert.ok(gridStart >= 0 && gridOpenEnd > gridAttribute && sectionEnd >= 0 && gridEnd >= gridOpenEnd, 'Product grid boundaries missing');
  productListComponentCount++;
  return markup.slice(0, gridOpenEnd) + componentCall('gran:product.list', {}) + markup.slice(gridEnd);
}

const home = rewrite(pages['/']);
const contentMarker = '<!-- bitrix:content -->';
const footerMarker = '<!-- bitrix:footer -->';
const headerMarker = '<!-- bitrix:header -->';
const headerAreaStart = home.indexOf(headerMarker);
const contentStart = home.indexOf(contentMarker);
const footerStart = home.indexOf(footerMarker);
const bodyCloseStart = home.indexOf('</body>');
assert.ok(headerAreaStart >= 0 && contentStart > headerAreaStart && footerStart >= 0 && bodyCloseStart > footerStart, 'Template area boundaries missing');

let commonHeader = home.slice(headerAreaStart + headerMarker.length, contentStart);
commonHeader = commonHeader.replace(/<nav class="desktop-nav"[\s\S]*?<\/nav>/, () => componentCall('gran:site.menu', { VARIANT: 'desktop' }));
commonHeader = commonHeader.replace(/<nav class="mobile-menu" id="mobile-menu"[\s\S]*?<\/nav>/, () => componentCall('gran:site.menu', { VARIANT: 'mobile' }));
assert.equal(commonHeader.split('gran:site.menu').length - 1, 2, 'Desktop and mobile menu component calls were not generated');
await writeArea('/include/gran/common/header.php', commonHeader);
await writeArea('/include/gran/common/footer.php', home.slice(footerStart + footerMarker.length, bodyCloseStart));
const bodyClose = home.slice(bodyCloseStart);

const guard = '<?php if (!defined("B_PROLOG_INCLUDED") || B_PROLOG_INCLUDED !== true) die(); ?>\n';
let header = home.slice(0, headerAreaStart) + includeCall('/include/gran/common/header.php') + '\n';
header = header
  .replace(/<title>.*?<\/title>/, '<title><?php $APPLICATION->ShowTitle(false); ?></title>')
  .replace(/<meta name="description" content="[^"]*"\s*\/?\s*>/, '<?php if ($description = $APPLICATION->GetPageProperty("description")): ?><meta name="description" content="<?=htmlspecialcharsbx($description)?>"><?php endif; ?>')
  .replace('</head>', '<?php if ($canonical = $APPLICATION->GetPageProperty("canonical")): ?><link rel="canonical" href="<?=htmlspecialcharsbx($canonical)?>"><?php endif; ?>\n<?php $APPLICATION->ShowHead(); ?>\n</head>')
  .replace('<body>', '<body>\n<?php $APPLICATION->ShowPanel(); ?>');
await writeFile(template + '/header.php', guard + header);
await writeFile(template + '/footer.php', guard + includeCall('/include/gran/common/footer.php') + '\n' + bodyClose);
await writeFile(template + '/description.php', '<?php\n$arTemplate = ["NAME" => "ГРАНЬ", "DESCRIPTION" => "Ворота и двери Hörmann: архитектурный шаблон"];\n');
await writeFile(template + '/styles.css', '/* Main styles are loaded from the bundled assets in header.php. */\n');

for (const path of ['assets', 'media', 'favicon.svg']) {
  await cp(`public/site/${path}`, `${template}/${path}`, { recursive: true });
}
for (const name of await readdir(template + '/assets')) {
  if (!/\.(js|css)$/.test(name)) continue;
  const file = `${template}/assets/${name}`;
  const content = rewrite(await readFile(file, 'utf8'));
  assert.ok(!content.includes('/site/'), `Unrewritten asset URL in ${name}`);
  if (name.startsWith('main-') && name.endsWith('.js')) assert.ok(content.includes('/api/leads/index.php'), 'Bitrix lead request must address the PHP endpoint without a directory redirect');
  await writeFile(file, content);
}

await mkdir(`${out}/bitrix/components/gran`, { recursive: true });
await cp('scripts/bitrix/components/gran', `${out}/bitrix/components/gran`, { recursive: true });
for (const name of ['product.card', 'product.detail', 'product.list', 'site.menu']) {
  const templatePath = `${out}/bitrix/components/gran/${name}/templates/.default/template.php`;
  assert.ok((await readFile(templatePath, 'utf8')).includes('B_PROLOG_INCLUDED'), `Missing Bitrix default template for gran:${name}`);
}
assert.ok((await readFile(`${out}/bitrix/components/gran/product.list/templates/.default/template.php`, 'utf8')).includes('gran:product.card'), 'Product list must render cards through the product.card component');
await mkdir(`${out}/include/gran/seed`, { recursive: true });
await cp('scripts/bitrix/include/gran/runtime.php', `${out}/include/gran/runtime.php`);
await cp('scripts/bitrix/include/gran/install.php', `${out}/include/gran/install.php`);
await cp('scripts/bitrix/api', `${out}/api`, { recursive: true });
const setupSource = await readFile('scripts/bitrix/gran-setup.php', 'utf8');
assert.ok(setupSource.includes('function gran_setup_is_editable_include') && setupSource.includes('$preservedAreaCount++'), 'Installer must preserve existing editable include areas on updates');

const productSeed = products.map(product => ({ ...product }));
await writeFile(`${out}/include/gran/seed/products.json`, JSON.stringify(productSeed, null, 2) + '\n');
await cp('scripts/bitrix/include/gran/seed/menu.json', `${out}/include/gran/seed/menu.json`);
await cp('data/tariffs.json', `${out}/include/gran/seed/tariffs.json`);
await cp('scripts/bitrix/gran-setup.php', 'release/gran-setup.php');

const decodeEntities = value => value
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>');
const pageSeed = Object.entries(pages).map(([route, html]) => {
  const title = decodeEntities(html.match(/<title>(.*?)<\/title>/)?.[1] ?? '');
  const description = decodeEntities(html.match(/<meta name="description" content="([^"]*)"\s*\/?\s*>/)?.[1] ?? '');
  const routeCode = route === '/' ? 'home' : route === '/404' ? '404' : route.slice(1).replaceAll('/', '-');
  return { code: routeCode, route, title, description };
});
await writeFile(`${out}/include/gran/seed/pages.json`, JSON.stringify(pageSeed, null, 2) + '\n');

function phpString(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

for (const [route, html] of Object.entries(pages)) {
  const dir = route === '/' ? out : out + route;
  await mkdir(dir, { recursive: true });
  const main = html.match(/(<main\b[^>]*>)([\s\S]*?)(<\/main>)/i);
  assert.ok(main, `Missing main element for ${route}`);
  const routeCode = route === '/' ? 'home' : route === '/404' ? '404' : route.slice(1).replaceAll('/', '-');
  let pageMain;
  const productRoute = route.match(/^\/catalog\/([a-z0-9_-]+)$/i);
  if (productRoute) {
    const product = products.find(item => item.id === productRoute[1]);
    assert.ok(product, `Product route has no matching data: ${route}`);
    pageMain = `${main[1]}\n${componentCall('gran:product.detail', { ELEMENT_CODE: product.id })}\n${main[3]}`;
  } else {
    const blocks = await Promise.all(splitSections(main[2]).map(async (sourceBlock, index) => {
      let block = rewrite(sourceBlock);
      block = externalizeProductGrid(block);
      if (block.includes('id="product-grid"')) {
        block = block.replace('id="product-grid"', 'id="product-grid" data-cms="Y"');
      }
      const path = `/include/gran/pages/${routeCode}/${areaName(sourceBlock, index)}.php`;
      await writeArea(path, block);
      areaCount++;
      return includeCall(path);
    }));
    const contentBlocks = blocks.join('\n');
    pageMain = route === '/catalog'
      ? `${main[1]}\n<?php if ($catalogProductCode !== ''): ?>\n<?php $APPLICATION->IncludeComponent("gran:product.detail", "", ["ELEMENT_CODE" => $catalogProductCode]); ?>\n<?php else: ?>\n${contentBlocks}\n<?php endif; ?>\n${main[3]}`
      : `${main[1]}\n${contentBlocks}\n${main[3]}`;
  }
  const statusCode = route === '/404' ? 'http_response_code(404); define("ERROR_404", "Y");' : '';
  const pageSetup = route === '/catalog'
    ? `$catalogProductCode = isset($_GET['product']) ? (string)$_GET['product'] : '';\nif ($catalogProductCode !== '' && preg_match('/^[a-z0-9_-]{1,100}$/i', $catalogProductCode)) {\n    $catalogProduct = gran_get_item('gran_products', $catalogProductCode);\n    if ($catalogProduct) {\n        if (!gran_apply_page_seo('catalog-' . $catalogProductCode)) {\n            $APPLICATION->SetTitle($catalogProduct['fields']['NAME'] . ' Hörmann');\n            if ($catalogProduct['fields']['PREVIEW_TEXT'] !== '') $APPLICATION->SetPageProperty('description', $catalogProduct['fields']['PREVIEW_TEXT']);\n        }\n    } else {\n        http_response_code(404);\n    }\n} elseif ($catalogProductCode !== '') {\n    http_response_code(404);\n    $catalogProductCode = '__invalid__';\n} else {\n    gran_apply_page_seo('catalog');\n}`
    : `gran_apply_page_seo('${phpString(routeCode)}');`;
  const file = route === '/404' ? `${out}/404.php` : `${dir}/index.php`;
  const page = `<?php\nrequire($_SERVER['DOCUMENT_ROOT'].'/bitrix/modules/main/include/prolog_before.php');\nrequire_once $_SERVER['DOCUMENT_ROOT'].'/include/gran/runtime.php';\n${pageSetup}\n${statusCode}\nrequire($_SERVER['DOCUMENT_ROOT'].'/bitrix/header.php');\n?>\n${pageMain}\n<?php require($_SERVER['DOCUMENT_ROOT'].'/bitrix/footer.php'); ?>\n`;
  await writeFile(file, page);
}

await writeFile(`${out}/INSTALL.md`, [
  '# Установка ГРАНЬ в 1С-Битрикс',
  '',
  '1. Сделайте свежую резервную копию сайта и базы в панели хостинга. Установщик также сохранит затрагиваемые текущие файлы в /upload/gran-backups/.',
  '2. Загрузите gran-bitrix-package.zip и отдельный файл gran-setup.php в корень сайта через файловый менеджер Битрикс.',
  '3. Откройте /gran-setup.php под администратором и нажмите «Установить». Установщик распакует шаблон, компоненты, страницы и создаст инфоблоки. Существующие записи инфоблоков с теми же кодами он не перезаписывает.',
  '4. Убедитесь, что сайт использует шаблон gran. Проверьте страницы и заявки; после успешной установки удалите из корня gran-setup.php и gran-bitrix-package.zip.',
  '',
  '## Где менять содержимое',
  '',
  '- Тексты и структуру блоков: публичная страница под администратором → режим правки → «Изменить включаемую область».',
  '- Товары: Контент → Инфоблоки → «ГРАНЬ: товары и направления». Название, картинка, описание, серия, категория и ссылка производителя редактируются в карточке товара.',
  '- Новое активное направление автоматически появляется в каталоге и в выпадающем меню; его карточка открывается по адресу `/catalog/?product=символьный-код`.',
  '- Основные пункты навигации: инфоблок «ГРАНЬ: меню сайта». Направления внутри пункта «Продукция» берутся из активных элементов каталога.',
  '- Цены: «ГРАНЬ: цены калькулятора» и «ГРАНЬ: настройки цен». Калькулятор перечитывает их с сервера, а заявка пересчитывается по текущим тарифам. Начальные суммы помечены как демонстрационные; переключите флаг после ввода реального прайса.',
  '- SEO: «ГРАНЬ: SEO страниц». Для каждой страницы доступны title, description и canonical.',
  '- Заявки: «ГРАНЬ: заявки сайта». Внешние уведомления не настроены, потому что адрес получателя не задан.',
  '',
  'Технические адреса страниц сохраняются. Путь шаблона — /bitrix/templates/gran.'
].join('\n') + '\n');

for (const route of Object.keys(pages)) {
  const file = route === '/404' ? `${out}/404.php` : `${out}${route === '/' ? '' : route}/index.php`;
  const content = await readFile(file, 'utf8');
  assert.ok(content.includes('/bitrix/footer.php'), `Missing Bitrix footer include for ${route}`);
  assert.ok(content.includes('gran_apply_page_seo'), `Page has no admin-editable SEO: ${route}`);
  if (route.startsWith('/catalog/') && route !== '/catalog') assert.ok(content.includes('gran:product.detail'), `Product route is not connected to the product infoblock: ${route}`);
}
assert.ok(areaCount > 2, 'Editable include areas were not generated');
assert.equal(productListComponentCount, 2, 'Home and catalog pages must render products from the CMS list component');
assert.ok((await readFile(`${out}/include/gran/common/header.php`, 'utf8')).includes('gran:site.menu'), 'Common header must use the menu component');
assert.ok((await readFile(`${out}/catalog/index.php`, 'utf8')).includes('$catalogProductCode'), 'Catalog must route dynamic product details');
console.log(`Exported ${Object.keys(pages).length} pages, ${areaCount} editable include areas, dynamic menu and product list components, and CMS integrations to ${out}.`);
