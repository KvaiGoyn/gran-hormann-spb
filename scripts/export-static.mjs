import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';

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

await build({
  configFile: false,
  base: './',
  publicDir: false,
  build: {
    outDir: path.resolve(output, 'assets'),
    assetsDir: '.',
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve('src/main.js'),
      name: 'GranSite',
      formats: ['iife'],
      fileName: 'offline'
    }
  }
});

const assetsDirectory = path.join(output, 'assets');
const sourceAssetNames = await readdir('site-build/assets');
const sourceStylesheet = sourceAssetNames.find(name => /^main-.+\.css$/.test(name));
assert.ok(sourceStylesheet, 'Missing normal compiled stylesheet');
const localStylesheet = (await readFile(path.join('site-build/assets', sourceStylesheet), 'utf8')).replaceAll('/site/assets/', './');
await writeFile(path.join(assetsDirectory, 'offline.css'), localStylesheet);
for (const name of await readdir(assetsDirectory)) {
  if (/^(?:main|gate-scene|pricing)-.+\.js$/.test(name) || /^main-.+\.css$/.test(name)) {
    await rm(path.join(assetsDirectory, name));
  }
}
const bundledAssets = await readdir(assetsDirectory);
const offlineJavaScript = bundledAssets.find(name => /^offline.*\.js$/.test(name));
const offlineStylesheet = bundledAssets.find(name => /^offline.*\.css$/.test(name));

await writeFile(path.join(output, '.htaccess'), [
  'Options -Indexes',
  'DirectoryIndex index.html',
  'ErrorDocument 404 /404.html',
  ''
].join('\n'));
await writeFile(path.join(output, 'README.md'), [
  '# Статическая версия сайта ГРАНЬ',
  '',
  'Для просмотра откройте `index.html` двойным щелчком. После изменения исходников повторите `npm run export:static`, затем обновите страницу в браузере.',
  'Если браузер блокирует 3D-модель при открытии файла, запустите `npm run preview:static` и откройте `http://127.0.0.1:4173` — это раздача готовых файлов без dev-режима.',
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
  let content = (await readFile(file, 'utf8'))
    .replaceAll('/site/', '/')
    .replaceAll('Заявки сохраняются на сервере; уведомления менеджеру и интеграция с 1С-Битрикс пока не подключены.', apiDisclosure);

  if (file.endsWith('.html')) {
    const relative = path.relative(output, file);
    const depth = path.dirname(relative) === '.' ? 0 : path.dirname(relative).split(path.sep).length;
    const rootPrefix = '../'.repeat(depth) || './';
    content = content
      .replace('<head>', `<head>\n  <meta name="site-root" content="${rootPrefix}" />`)
      .replace(/<script type="module"[^>]*src="\/assets\/[^\"]+"[^>]*><\/script>/, `<script src="${rootPrefix}assets/${offlineJavaScript}" defer></script>`)
      .replace(/<link rel="stylesheet"[^>]*href="\/assets\/[^\"]+"[^>]*>/, `<link rel="stylesheet" href="${rootPrefix}assets/${offlineStylesheet}" />`)
      .replace(/(href|src|poster|action)="\/(?!\/)([^\"]*)"/g, (_match, attribute, pathAndHash) => {
        const hashAt = pathAndHash.indexOf('#');
        const pathname = hashAt >= 0 ? pathAndHash.slice(0, hashAt) : pathAndHash;
        const suffix = hashAt >= 0 ? pathAndHash.slice(hashAt) : '';
        const localPath = pathname ? pathname.replace(/\/$/, '/index.html') : 'index.html';
        return `${attribute}="${rootPrefix}${localPath}${suffix}"`;
      });
  }
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
for (const file of htmlFiles) {
  const content = await readFile(file, 'utf8');
  assert.ok(!/<script\b[^>]*type="module"/i.test(content), `Module script cannot run from file:// in ${file}`);
  assert.ok(!/\b(?:href|src|poster|action)="\/(?!\/)/i.test(content), `Absolute local URL cannot resolve from file:// in ${file}`);
  for (const [, value] of content.matchAll(/\b(?:href|src|poster|action)="([^"]+)"/gi)) {
    if (!value || value.startsWith('#') || value.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(value)) continue;
    const localPath = value.split(/[?#]/, 1)[0];
    if (!localPath) continue;
    const target = path.resolve(path.dirname(file), decodeURIComponent(localPath));
    assert.ok(exportedFiles.includes(path.relative(process.cwd(), target)), `Missing local file ${value} referenced from ${file}`);
  }
}
for (const route of ['index.html', 'catalog/index.html', 'catalog/garage/index.html', 'calculator/index.html', '404.html']) {
  assert.ok(exportedFiles.includes(path.join(output, route)), `Missing exported page ${route}`);
}
const assetNames = await readdir(path.join(output, 'assets'));
assert.ok(assetNames.some(name => /^offline.*\.css$/.test(name)), 'Missing file-compatible CSS bundle');
assert.ok(assetNames.some(name => /^offline.*\.js$/.test(name)), 'Missing file-compatible JavaScript bundle');
for (const asset of ['media/architecture-film.mp4', 'media/architecture.webp', 'media/garage-apartment.glb', 'favicon.svg']) {
  assert.ok(exportedFiles.includes(path.join(output, asset)), `Missing static asset ${asset}`);
}

const javascript = (await Promise.all(exportedFiles.filter(file => file.endsWith('.js')).map(file => readFile(file, 'utf8')))).join('\n');
assert.ok(javascript.includes('/api/leads'), 'The lead form endpoint should remain configurable for a connected server API');
assert.ok(javascript.includes('demo-2026-10-15'), 'The demo calculator tariffs must be bundled');
const indexHtml = await readFile(path.join(output, 'index.html'), 'utf8');
assert.ok(indexHtml.includes(apiDisclosure), 'Static pages must disclose that forms need a server API');
assert.ok(indexHtml.includes('<meta name="site-root" content="./" />'), 'Static pages must use a local root for file:// URLs');
assert.match(indexHtml, /assets\/offline[^" ]+\.js/, 'Static pages must load the classic JavaScript bundle');

console.log(`Exported ${htmlFiles.length} HTML pages, frontend assets, images, video and 3D media to ${output}.`);
