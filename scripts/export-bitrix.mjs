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
let productComponentCount = 0;
async function externalizeProductCards(markup) {
  const cards = [...markup.matchAll(/<article\b[^>]*class="product-card"[^>]*>/gi)];
  if (!cards.length) return markup;
  let result = '';
  let cursor = 0;
  for (const opening of cards) {
    const closingStart = markup.indexOf('</article>', opening.index);
    assert.ok(closingStart >= 0, 'Unclosed product card');
    const end = closingStart + '</article>'.length;
    const card = markup.slice(opening.index, end);
    const productId = card.match(/href="\/catalog\/([^/]+)\//)?.[1];
    assert.ok(productId && products.some(product => product.id === productId), `Unknown product in card: ${productId}`);
    productComponentCount++;
    result += markup.slice(cursor, opening.index) + componentCall('gran:product.card', { ELEMENT_CODE: productId });
    cursor = end;
  }
  return result + markup.slice(cursor);
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

await writeArea('/include/gran/common/header.php', home.slice(headerAreaStart + headerMarker.length, contentStart));
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
for (const name of ['product.card', 'product.detail']) {
  const templatePath = `${out}/bitrix/components/gran/${name}/templates/.default/template.php`;
  assert.ok((await readFile(templatePath, 'utf8')).includes('B_PROLOG_INCLUDED'), `Missing Bitrix default template for gran:${name}`);
}
await mkdir(`${out}/include/gran/seed`, { recursive: true });
await cp('scripts/bitrix/include/gran/runtime.php', `${out}/include/gran/runtime.php`);
await cp('scripts/bitrix/include/gran/install.php', `${out}/include/gran/install.php`);
await cp('scripts/bitrix/api', `${out}/api`, { recursive: true });

const productSeed = products.map(product => ({ ...product }));
await writeFile(`${out}/include/gran/seed/products.json`, JSON.stringify(productSeed, null, 2) + '\n');
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
      block = await externalizeProductCards(block);
      if (block.includes('id="product-grid"')) {
        block = block.replace('id="product-grid"', 'id="product-grid" data-cms="Y"');
      }
      const path = `/include/gran/pages/${routeCode}/${areaName(sourceBlock, index)}.php`;
      await writeArea(path, block);
      areaCount++;
      return includeCall(path);
    }));
    pageMain = `${main[1]}\n${blocks.join('\n')}\n${main[3]}`;
  }
  const statusCode = route === '/404' ? 'http_response_code(404); define("ERROR_404", "Y");' : '';
  const file = route === '/404' ? `${out}/404.php` : `${dir}/index.php`;
  const page = `<?php\nrequire($_SERVER['DOCUMENT_ROOT'].'/bitrix/modules/main/include/prolog_before.php');\nrequire_once $_SERVER['DOCUMENT_ROOT'].'/include/gran/runtime.php';\ngran_apply_page_seo('${phpString(routeCode)}');\n${statusCode}\nrequire($_SERVER['DOCUMENT_ROOT'].'/bitrix/header.php');\n?>\n${pageMain}\n<?php require($_SERVER['DOCUMENT_ROOT'].'/bitrix/footer.php'); ?>\n`;
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
assert.ok(productComponentCount >= products.length, 'Product cards were not converted to Bitrix components');
console.log(`Exported ${Object.keys(pages).length} pages, ${areaCount} editable include areas, ${productComponentCount} product card components and CMS integrations to ${out}.`);
