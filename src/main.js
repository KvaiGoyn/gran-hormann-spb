import './style.css';
import './home.css';
import { products, productCards } from './products.js';
import { colors, scenePalettes } from './configurator.js';

const $ = selector => document.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const money = amount => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(amount);
const grid = $('#product-grid');
let scene;
let selectedSurface = 'gate';
const selectedSceneColors = Object.fromEntries(Object.entries(scenePalettes).map(([surface, palette]) => [surface, palette.initial]));
const sceneColors = Object.fromEntries(Object.entries(scenePalettes).map(([surface, palette]) => [surface, palette.colors[palette.initial].value]));
let opened = false;
let currentQuote;
let leadConfiguration;
let leadTopic = 'Консультация';

function renderProducts(filter) {
  if (!grid) return;
  if (grid.dataset.cms === 'Y') {
    const cards = $$('.product-card', grid);
    const visible = cards.filter(card => {
      const show = filter === 'all' || card.dataset.category === filter;
      card.hidden = !show;
      return show;
    });
    grid.classList.toggle('business-grid', filter === 'business');
    $('.catalog-count').textContent = `${visible.length} ${visible.length === 1 ? 'направление' : visible.length >= 2 && visible.length <= 4 ? 'направления' : 'направлений'}`;
    $$('[data-filter]').forEach(button => {
      const active = button.dataset.filter === filter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    return;
  }
  const items = products.filter(product => filter === 'all' || product.category === filter);
  grid.classList.toggle('business-grid', filter === 'business');
  grid.innerHTML = productCards(items, import.meta.env.BASE_URL);
  $('.catalog-count').textContent = `${items.length} ${items.length === 2 || items.length === 4 ? 'направления' : 'направлений'}`;
  $$('[data-filter]').forEach(button => {
    const active = button.dataset.filter === filter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
renderProducts(grid?.dataset.initial || 'home');
$$('nav a').forEach(link => {
  if (new URL(link.href).pathname.replace(/\/$/,'') === location.pathname.replace(/\/$/,'') && location.pathname !== '/') link.setAttribute('aria-current','page');
});
function closeMenu() {
  $('#mobile-menu').hidden = true;
  $('.menu-toggle').setAttribute('aria-expanded', 'false');
  $('.menu-toggle').setAttribute('aria-label', 'Открыть меню');
}
$('.menu-toggle').addEventListener('click', () => {
  const open = $('#mobile-menu').hidden;
  $('#mobile-menu').hidden = !open;
  $('.menu-toggle').setAttribute('aria-expanded', String(open));
  $('.menu-toggle').setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
});
$('#mobile-menu').addEventListener('click', event => { if (event.target.closest('a,button')) closeMenu(); });
window.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
function openDialog(dialog) {
  $$('dialog[open]').forEach(open => open.close());
  closeMenu();
  dialog.showModal();
}
function openLead(topic='Консультация',configuration=null) {
  leadTopic = topic;
  leadConfiguration = configuration;
  const form=$('#dialog-form');
  if(form.dataset.saved){form.reset();delete form.dataset.saved;[...form.elements].forEach(field=>field.disabled=false);form.querySelector('[type="submit"]').innerHTML='Отправить заявку <span>↗</span>';form.querySelector('.lead-status').textContent='';}
  $('#lead-context').textContent = configuration ? `Секционные ворота ${configuration.width} × ${configuration.height} мм · ${money(currentQuote.price)}${currentQuote.demo ? ' по демонстрационным тарифам' : ' по действующим тарифам'}. Комплектация будет приложена к заявке.` : topic==='Консультация'?'Расскажите о задаче. Начнём с деталей.':topic;
  openDialog($('#lead-dialog'));
}
function openVideo() {
  const dialog = $('#video-dialog');
  const frame = $('#video-frame');
  if (!dialog || !frame) return;
  openDialog(dialog);
  const video = document.createElement('video');
  video.src = `${import.meta.env.BASE_URL}media/architecture-film.mp4`;
  video.poster = `${import.meta.env.BASE_URL}media/architecture.webp`;
  video.controls = true;
  video.muted = true;
  video.playsInline = true;
  video.autoplay = !reducedMotion.matches;
  video.setAttribute('aria-label','ГРАНЬ. Архитектура и детали — визуальный этюд без звука');
  frame.replaceChildren(video);
}
$('#video-dialog')?.addEventListener('close', () => $('#video-frame')?.replaceChildren());
document.addEventListener('click', event => {
  const button = event.target.closest('button,a');
  if (!button) return;
  if (button.hasAttribute('data-filter')) renderProducts(button.dataset.filter);
  if (button.hasAttribute('data-product')) location.href=`/catalog/${button.dataset.product}/`;
  if (button.hasAttribute('data-config')) openLead();
  if (button.hasAttribute('data-lead')) openLead(button.dataset.lead);
  if (button.hasAttribute('data-quote') && currentQuote) openLead('Расчёт секционных ворот',currentQuote.configuration);
  if (button.hasAttribute('data-video')) openVideo();
  if (button.hasAttribute('data-info')) openDialog($('#info-dialog'));
  if (button.hasAttribute('data-close')) button.closest('dialog').close();
});
$$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
}));

$$('[data-lead-form]').forEach(form=>{
 let lastBody,requestId;
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(form.dataset.sending || form.dataset.saved)return;
  const fields=form.elements;
  const body={name:fields.name.value,phone:fields.phone.value,message:fields.message.value,website:fields.website.value,consent:fields.consent.checked,topic:form.id==='dialog-form'?leadTopic:'Консультация',configuration:form.id==='dialog-form'?leadConfiguration:null};
  const serialized=JSON.stringify(body);
  if(serialized!==lastBody){lastBody=serialized;requestId=crypto.randomUUID();}
  const status=form.querySelector('.lead-status'),button=form.querySelector('[type="submit"]');
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),15000);
  form.dataset.sending='true';button.disabled=true;button.textContent='Отправляем…';status.textContent='';status.classList.remove('success');
  try{
   const response=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,requestId}),signal:controller.signal});
   const result=await response.json();
   if(!response.ok || result.status!=='stored' || !result.id)throw new Error(result.error || 'Не удалось сохранить заявку. Попробуйте ещё раз.');
   form.dataset.saved='true';status.classList.add('success');status.textContent=`Заявка сохранена. Номер: ${result.id.slice(0,8).toUpperCase()}.`;
   [...form.elements].forEach(field=>field.disabled=true);button.textContent='Заявка отправлена ✓';
  }catch(error){status.textContent=error.name==='AbortError'?'Ответ сервера не получен. Повторите отправку — дубликат не будет создан.':error instanceof SyntaxError?'Сервис временно недоступен. Данные остались в форме. Попробуйте позже.':error.message;button.disabled=false;button.innerHTML='Повторить отправку <span>↗</span>';}
  finally{clearTimeout(timeout);delete form.dataset.sending;}
 });
});

const calculator=$('#calculator-form');
if(calculator){
 const {calculatePrice,tariffs:fallbackTariffs}=await import('../server/pricing.js');
 const fields=calculator.elements;
 let rateTable=fallbackTariffs;
 fields.color.value='anthracite';fields.drive.value='standard';fields.delivery.value='spb';
 function replaceOptions(field,map){
  const selected=field.value;
  field.replaceChildren(...Object.entries(map).map(([value,item])=>new Option(item.label,value)));
  field.value=Object.hasOwn(map,selected)?selected:Object.keys(map)[0];
 }
 function updateQuote(){
  const values={width:fields.width.valueAsNumber,height:fields.height.valueAsNumber,color:fields.color.value,surface:fields.surface.value,drive:fields.drive.value,delivery:fields.delivery.value,installation:fields.installation.checked};
  currentQuote=calculatePrice(values,rateTable);
  $('#quote-request').disabled=!currentQuote;$('#quote-download').disabled=!currentQuote;
  $('#quote-error').textContent=currentQuote?'':'Укажите целые размеры: ширина 2000–6000 мм, высота 1800–3500 мм.';
  $('#quote-total').textContent=currentQuote?money(currentQuote.price):'—';
  $('#quote-size').textContent=currentQuote?`${values.width} × ${values.height} мм`:'Проверьте размеры';
  $('#quote-lines').innerHTML=currentQuote?currentQuote.items.map(item=>`<div><span>${item.label}</span><strong>${money(item.amount)}</strong></div>`).join(''):'';
  if(currentQuote){$('#dimension-width').textContent=`${values.width} мм`;$('#dimension-height').textContent=`${values.height} мм`;$('#gate-elevation').style.setProperty('--gate-ratio',values.width/values.height);$('#gate-elevation').style.setProperty('--gate-color',colors[values.color]?.value || '#3b4146');$('#gate-elevation').dataset.surface=values.surface;}
 }
 calculator.addEventListener('input',updateQuote);calculator.addEventListener('submit',event=>event.preventDefault());updateQuote();
 $('#quote-download').addEventListener('click',()=>{
  if(!currentQuote)return;
  const text=['ГРАНЬ · Предварительный расчёт',currentQuote.demo?'ДЕМОНСТРАЦИОННЫЕ ТАРИФЫ. Не прайс Hörmann и не оферта.':'Предварительный расчёт по тарифам сайта. Итог подтверждается после замера.',`Тариф: ${currentQuote.tariffVersion}`,'',...currentQuote.items.map(item=>`${item.label}: ${money(item.amount)}`),'',`ИТОГО: ${money(currentQuote.price)}`,'Точную цену и возможность изготовления подтверждает специалист после замера.'].join('\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='ГРАНЬ — предварительный расчёт.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 });
 fetch('/api/tariffs/',{headers:{Accept:'application/json'},cache:'no-store'}).then(async response=>{
  if(!response.ok)return;
  const liveRates=await response.json();
  if(!liveRates || !liveRates.colors || !liveRates.surfaces || !liveRates.drives || !liveRates.delivery)return;
  rateTable=liveRates;
  replaceOptions(fields.color,rateTable.colors);
  replaceOptions(fields.surface,rateTable.surfaces);
  replaceOptions(fields.drive,rateTable.drives);
  replaceOptions(fields.delivery,rateTable.delivery);
  const demoLabel=$('[data-demo-label]'),disclaimer=$('[data-quote-disclaimer]'),version=$('[data-quote-version]');
  if(demoLabel)demoLabel.hidden=!rateTable.demo;
  if(disclaimer)disclaimer.textContent=rateTable.demo?'Цены демонстрационные и не являются прайсом Hörmann или офертой. Итоговую цену подтверждает специалист после замера.':'Предварительный расчёт по настроенным тарифам. Итоговую цену подтверждает специалист после замера.';
  if(version)version.textContent=`Тарифы: ${rateTable.version}`;
  updateQuote();
 }).catch(()=>{});
}
function renderSceneSwatches() {
  const colorName = $('#color-name');
  const swatches = $('#scene-swatches');
  if (!colorName || !swatches) return;
  const palette = scenePalettes[selectedSurface].colors;
  const currentColor = selectedSceneColors[selectedSurface];
  colorName.textContent = palette[currentColor].name;
  swatches.replaceChildren(...Object.entries(palette).map(([id, color]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `swatch${id === currentColor ? ' selected' : ''}`;
    button.dataset.color = id;
    button.style.setProperty('--swatch', color.value);
    button.setAttribute('aria-label', color.name);
    button.setAttribute('aria-pressed', String(id === currentColor));
    button.addEventListener('click', () => {
      selectedSceneColors[selectedSurface] = id;
      sceneColors[selectedSurface] = color.value;
      scene?.setColor(selectedSurface, color.value);
      renderSceneSwatches();
    });
    return button;
  }));
}
renderSceneSwatches();
$$('.surface-tabs [data-surface]').forEach(button => button.addEventListener('click', () => {
  selectedSurface = button.dataset.surface;
  $$('.surface-tabs [data-surface]').forEach(item => {
    const selected = item === button;
    item.classList.toggle('selected', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  renderSceneSwatches();
}));
if ($('#gate-toggle')) $('#gate-toggle').disabled = true;
$('#gate-toggle')?.addEventListener('click', () => {
  if (!scene) return;
  opened = !opened;
  $('#gate-toggle').setAttribute('aria-pressed', String(opened));
  $('.gate-button-label').textContent = opened ? 'Закрыть ворота' : 'Открыть ворота';
  $('#gate-state').textContent = opened ? 'Открыто' : 'Закрыто';
  scene.setOpen(opened);
});
$$('[data-view]').forEach(button => button.addEventListener('click', () => {
  scene?.setView(button.dataset.view);
  $$('[data-view]').forEach(item => {
    item.classList.toggle('active', item === button);
    item.setAttribute('aria-pressed', String(item === button));
  });
}));
const sceneObserver = new IntersectionObserver(async ([entry]) => {
  if (!entry.isIntersecting) return;
  sceneObserver.disconnect();
  try {
    const { createGateScene } = await import('./gate-scene.js');
    scene = await createGateScene($('#gate-scene'), { reducedMotion, colors: sceneColors, assetUrl: `${import.meta.env.BASE_URL}media/garage-apartment.glb` });
    $('#gate-toggle').disabled = false;
  } catch (error) {
    console.warn('3D unavailable; image fallback is active.', error.message);
    $('.scene-loading').textContent = '3D недоступно в этом браузере. Подберите параметры ворот ниже.';
    $('.drag-hint').textContent = 'Архитектурная визуализация';
    $$('.view-buttons button').forEach(button => { button.disabled = true; });
  }
}, { rootMargin: '300px' });
if ($('#studio')) sceneObserver.observe($('#studio'));

let scrollPending = false;
const hero=$('.hero');
if(hero){
 function updateHero(){scrollPending=false;if(reducedMotion.matches || window.scrollY>hero.offsetHeight+100)return;$('.hero-visual').style.transform=`translateY(${Math.min(window.scrollY*.15,100)}px) scale(1.015)`;}
 window.addEventListener('scroll',()=>{if(!scrollPending){scrollPending=true;requestAnimationFrame(updateHero);}},{passive:true});
 reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)$('.hero-visual').style.transform='';});
}
