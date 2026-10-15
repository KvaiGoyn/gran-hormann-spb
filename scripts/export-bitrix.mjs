import { readFile,writeFile,mkdir,rm,cp,readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const pages=JSON.parse(await readFile('generated/pages.json','utf8'));
const out='release/bitrix';const template=out+'/local/templates/gran';
await rm(out,{recursive:true,force:true});await mkdir(template,{recursive:true});
const rewrite=html=>html.replaceAll('/site/','/local/templates/gran/');
const home=rewrite(pages['/']);
const start='<!-- bitrix:content -->',end='<!-- bitrix:footer -->';
assert.ok(home.includes(start)&&home.includes(end),'Template boundaries missing');
let header=home.split(start)[0].replace(/<title>.*?<\/title>/,'<title><?php $APPLICATION->ShowTitle(); ?></title>').replace('</head>','<?php $APPLICATION->ShowHead(); ?>\n</head>').replace('<body>','<body>\n<?php $APPLICATION->ShowPanel(); ?>');
const guard='<?php if (!defined("B_PROLOG_INCLUDED") || B_PROLOG_INCLUDED !== true) die(); ?>\n';
await writeFile(template+'/header.php',guard+header);
await writeFile(template+'/footer.php',guard+home.split(end)[1]);
await writeFile(template+'/description.php','<?php\n$arTemplate = ["NAME" => "ГРАНЬ", "DESCRIPTION" => "Ворота и двери Hörmann: архитектурный шаблон"];\n');
await writeFile(template+'/styles.css','/* Main styles are loaded from the bundled assets in header.php. */\n');
for(const path of ['assets','media','favicon.svg'])await cp('public/site/'+path,template+'/'+path,{recursive:true});
for(const name of await readdir(template+'/assets')){if(/\.(js|css)$/.test(name)){const file=template+'/assets/'+name;await writeFile(file,rewrite(await readFile(file,'utf8')));assert.ok(!(await readFile(file,'utf8')).includes('/site/'));}}
for(const [route,html] of Object.entries(pages)){
 const dir=route==='/'?out:out+route;await mkdir(dir,{recursive:true});
 const title=html.match(/<title>(.*?)<\/title>/)[1];
 const safe=title.replaceAll('\\','\\\\').replaceAll("'","\\'");
 const file=route==='/404'?out+'/404.php':dir+'/index.php';
 const php=`<?php\n${route==='/404'?'http_response_code(404); define("ERROR_404", "Y");\n':''}require($_SERVER['DOCUMENT_ROOT'].'/bitrix/header.php');\n$APPLICATION->SetTitle('${safe}');\n?>\n${rewrite(html.split(start)[1].split(end)[0])}\n<?php require($_SERVER['DOCUMENT_ROOT'].'/bitrix/footer.php'); ?>\n`;
 await writeFile(file,php);
}
await mkdir(out+'/api/leads',{recursive:true});
await writeFile(out+'/api/leads/index.php',`<?php
// shortcut: Bitrix forms/storage are not installed yet; replace this adapter after CMS integration.
http_response_code(503);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode(['error' => 'Приём заявок на этом сервере пока не подключён.'], JSON_UNESCAPED_UNICODE);
`);
await cp('data/tariffs.json',out+'/tariffs-reference.json');
await writeFile(out+'/INSTALL.md',`# Шаблон ГРАНЬ для 1С-Битрикс\n\nКопировать local/templates/gran в local/templates и назначить шаблон сайту в панели Битрикс. Страницы находятся в корне и соответствующих каталогах. Настроить обработку 404.php средствами установленного Битрикс.\n\nЭто экспорт вёрстки, а не установленная CMS. Каталог пока содержит статические данные, калькулятор — демонстрационные тарифы. Для управления из CMS перенести данные в инфоблоки и пересобирать frontend при смене тарифов.\n\nPOST /api/leads пока возвращает честный 503. Реализовать сохранение в веб-формы/инфоблок Битрикс, проверку согласия, серверный пересчёт, лимит запросов и идемпотентность по requestId. Контракт — README исходного проекта; работающий серверный пример — server/leads.js. Подключить получателя уведомлений. Не принимать клиентскую сумму.\n\nДо публичного запуска заполнить реквизиты оператора данных и политику. PHP/Битрикс в текущей среде отсутствуют: пакет проверен структурно, интеграционный тест не выполнен.\n`);
for(const route of Object.keys(pages))assert.ok((await readFile(route==='/404'?out+'/404.php':`${out}${route==='/'?'':route}/index.php`,'utf8')).includes("/bitrix/footer.php"));
console.log(`Exported ${Object.keys(pages).length} pages to ${out}; PHP integration pending.`);
