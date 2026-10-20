import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const source = 'site-build/generated/html';
const output = 'release/static';
const textExtensions = new Set(['.html', '.css', '.js', '.svg', '.json', '.xml', '.txt', '.webmanifest']);
const apiDisclosure = 'В статической версии заявки не сохраняются. Для их приёма нужен серверный API или внешний сервис форм.';
const filesUnder = async directory => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  }))).flat();
};

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const pages = await filesUnder(source);
for (const file of pages) {
  const relative = path.relative(source, file);
  const destination = relative === path.join('404', 'index.html') ? '404.html' : relative;
  const target = path.join(output, destination);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, await readFile(file, 'utf8'));
}

for (const directory of ['assets', 'media']) {
  await cp(`site-build/${directory}`, path.join(output, directory), { recursive: true });
}
await cp('site-build/favicon.svg', path.join(output, 'favicon.svg'));

await writeFile(path.join(output, '.htaccess'), [
  'Options -Indexes',
  'DirectoryIndex index.html',
  'ErrorDocument 404 /404.html',
  ''
].join('\n'));
await writeFile(path.join(output, 'README.md'), [
  '# Статическая версия сайта ГРАНЬ',
  '',
  'Загрузите содержимое этой папки в корень сайта на хостинге (обычно `public_html`), а не саму папку `static`.',
  'HTML-страницы расположены по адресам в папках с `index.html`; CSS, JavaScript и шрифты — в `assets/`, изображения, видео и 3D-модель — в `media/`.',
  '',
  'Калькулятор работает с демонстрационными тарифами, встроенными в сборку. Они не являются прайсом Hörmann или коммерческим предложением.',
  'Заявки в статической версии не сохраняются: для их приёма подключите серверный обработчик или внешний сервис форм. В текущем пакете такого API нет.',
  ''
].join('\n'));

const exportedFiles = await filesUnder(output);
const exportedText = exportedFiles.filter(file => textExtensions.has(path.extname(file).toLowerCase()));
for (const file of exportedText) {
  const content = (await readFile(file, 'utf8'))
    .replaceAll('/site/', '/')
    .replaceAll('Заявки сохраняются на сервере; уведомления менеджеру и интеграция с 1С-Битрикс пока не подключены.', apiDisclosure);
  await writeFile(file, content);
  assert.ok(!content.includes('/site/'), `Unrewritten /site/ path in ${file}`);
}
const resourcePaths = new Set();
for (const file of exportedText) {
  const content = await readFile(file, 'utf8');
  for (const match of content.matchAll(/\/(?:assets|media)\/[a-zA-Z0-9_./-]+/g)) resourcePaths.add(match[0]);
}
for (const resource of resourcePaths) {
  assert.ok(exportedFiles.includes(path.join(output, resource.slice(1))), `Missing referenced asset ${resource}`);
}

const htmlFiles = exportedFiles.filter(file => file.endsWith('.html'));
assert.ok(pages.length > 0, 'No generated pages found');
assert.equal(htmlFiles.length, pages.length, 'Not all generated pages were exported');
for (const route of ['index.html', 'catalog/index.html', 'catalog/garage/index.html', 'calculator/index.html', '404.html']) {
  assert.ok(exportedFiles.includes(path.join(output, route)), `Missing exported page ${route}`);
}
const assetNames = await readdir(path.join(output, 'assets'));
assert.ok(assetNames.some(name => /^main-.+\.css$/.test(name)), 'Missing compiled CSS bundle');
assert.ok(assetNames.some(name => /^main-.+\.js$/.test(name)), 'Missing compiled JavaScript bundle');
for (const asset of ['media/architecture-film.mp4', 'media/architecture.webp', 'media/garage-apartment.glb', 'favicon.svg']) {
  assert.ok(exportedFiles.includes(path.join(output, asset)), `Missing static asset ${asset}`);
}

const javascript = (await Promise.all(exportedFiles.filter(file => file.endsWith('.js')).map(file => readFile(file, 'utf8')))).join('\n');
assert.ok(javascript.includes('/api/leads'), 'The lead form endpoint should remain configurable for a connected server API');
assert.ok(javascript.includes('demo-2026-10-15'), 'The demo calculator tariffs must be bundled');
const indexHtml = await readFile(path.join(output, 'index.html'), 'utf8');
assert.ok(indexHtml.includes(apiDisclosure), 'Static pages must disclose that forms need a server API');

console.log(`Exported ${htmlFiles.length} HTML pages, frontend assets, images, video and 3D media to ${output}.`);
