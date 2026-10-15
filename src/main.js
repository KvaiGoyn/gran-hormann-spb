import './style.css';
import './home.css';
import { products, productCards } from './products.js';
import { colors } from './configurator.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const money = amount => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(amount);
const grid = $('#product-grid');
let selectedColor = 'anthracite';
let scene;
let opened = false;
let currentQuote;
let leadConfiguration;
let leadTopic = 'Консультация';

function renderProducts(filter) {
  if (!grid) return;
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
  $('#lead-context').textContent = configuration ? `Секционные ворота ${configuration.width} × ${configuration.height} мм · ${money(currentQuote.price)} по демонстрационным тарифам. Комплектация будет приложена к заявке.` : topic==='Консультация'?'Расскажите о задаче. Начнём с деталей.':topic;
  openDialog($('#lead-dialog'));
}
function openVideo() {
  openDialog($('#video-dialog'));
  const video = document.createElement('video');
  video.src = `${import.meta.env.BASE_URL}media/architecture-film.mp4`;
  video.poster = `${import.meta.env.BASE_URL}media/architecture.webp`;
  video.controls = true;
  video.muted = true;
  video.playsInline = true;
  video.autoplay = !reducedMotion.matches;
  video.setAttribute('aria-label','ГРАНЬ. Архитектура и детали — визуальный этюд без звука');
  $('#video-frame').replaceChildren(video);
}
$('#video-dialog').addEventListener('close', () => $('#video-frame').replaceChildren());
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
 const {calculatePrice}=await import('../server/pricing.js');
 const fields=calculator.elements;
 fields.color.value='anthracite';fields.drive.value='standard';fields.delivery.value='spb';
 function updateQuote(){
  const values={width:fields.width.valueAsNumber,height:fields.height.valueAsNumber,color:fields.color.value,surface:fields.surface.value,drive:fields.drive.value,delivery:fields.delivery.value,installation:fields.installation.checked};
  currentQuote=calculatePrice(values);
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
  const text=['ГРАНЬ · Предварительный расчёт','ДЕМОНСТРАЦИОННЫЕ ТАРИФЫ. Не прайс Hörmann и не оферта.',`Тариф: ${currentQuote.tariffVersion}`,'',...currentQuote.items.map(item=>`${item.label}: ${money(item.amount)}`),'',`ИТОГО: ${money(currentQuote.price)}`,'Точную цену и возможность изготовления подтверждает специалист после замера.'].join('\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='ГРАНЬ — предварительный расчёт.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 });
}
$$('[data-color]').forEach(button => button.addEventListener('click', () => {
  selectedColor = button.dataset.color;
  $('#color-name').textContent = colors[selectedColor].name;
  $$('[data-color]').forEach(item => {
    const selected = item === button;
    item.classList.toggle('selected', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  scene?.setColor(colors[selectedColor].value);
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
    scene = createGateScene($('#gate-scene'), { reducedMotion, color: colors[selectedColor].value });
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
