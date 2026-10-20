import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { build } from 'vite';
import { products, productCards } from '../src/products.js';
import { pageContent, leadForm } from './page-content.mjs';
const source = await readFile('index.html','utf8');
const dialog = `<dialog class="config-dialog lead-dialog" id="lead-dialog" aria-labelledby="lead-title"><button class="dialog-close icon-button" aria-label="Закрыть заявку" data-close>×</button><p class="section-kicker">От идеи к вашему решению</p><h2 id="lead-title">Обсудим ваш проект.</h2><p class="dialog-intro" id="lead-context">Расскажите о задаче. Начнём с деталей.</p>${leadForm('dialog')}</dialog>`;
const common = source.replace('<!-- lead-dialog -->',dialog);
const fillCatalog = (html,items) => html.replace(/(<div class="product-grid" id="product-grid"[^>]*>)(<\/div>)/, (_,open,close) => open+productCards(items)+close);
const entries = {home:'generated/html/index.html'};
const routes = {'/':'index.html'};
await mkdir('generated/html',{recursive:true});
await writeFile('generated/html/index.html',fillCatalog(common,products.filter(p=>p.category==='home')));
for(const [route,page] of Object.entries(pageContent)){
 const file = `generated/html${route}/index.html`;
 await mkdir(file.slice(0,file.lastIndexOf('/')),{recursive:true});
 const html = common.replace(/<title>.*?<\/title>/,`<title>${page.title} — ГРАНЬ</title>`).replace(/<meta name="description" content="[^"]*"\s*\/>/,`<meta name="description" content="${page.description}" />`).replace(/<link rel="preload"[^>]*>/,'').replace(/<main id="main">[\s\S]*?<\/main>/,`<main id="main" class="inner-page">${page.html}</main>`);
 await writeFile(file,fillCatalog(html,products));
 entries[route.slice(1).replaceAll('/','-')]=file;
 routes[route]=route.slice(1)+'/index.html';
}
await build({configFile:false,base:'/site/',publicDir:'web-public',build:{outDir:'site-build',emptyOutDir:true,cssMinify:false,rolldownOptions:{input:entries}}});
const pages={};
for(const [route,path] of Object.entries(routes))pages[route]=await readFile(`site-build/generated/html/${path}`,'utf8');
await writeFile('generated/pages.json',JSON.stringify(pages));
await rm('public/site',{recursive:true,force:true});
await mkdir('public/site',{recursive:true});
for(const path of ['assets','media','favicon.svg'])await cp(`site-build/${path}`,`public/site/${path}`,{recursive:true});
console.log(`Built ${Object.keys(pages).length} routes and shared frontend assets.`);
