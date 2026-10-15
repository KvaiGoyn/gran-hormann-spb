import { calculatePrice } from './pricing.js';

export const consentVersion = '2026-10-15';
export function validateLead(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Некорректная заявка.');
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  const topic = typeof input.topic === 'string' ? input.topic.trim() : 'Консультация';
  if (name.length < 2 || name.length > 80) throw new Error('Укажите имя от 2 до 80 символов.');
  if (!/^[+\d\s()\-]{10,30}$/.test(phone) || !/^\d{10,15}$/.test(phone.replace(/\D/g,''))) throw new Error('Проверьте номер телефона.');
  if (message.length > 1500 || topic.length > 100) throw new Error('Сократите сообщение до 1500 символов.');
  if (input.consent !== true) throw new Error('Нужно согласие на обработку данных заявки.');
  if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new Error('Обновите страницу и попробуйте ещё раз.');
  if (input.website) throw new Error('Не удалось отправить заявку.');
  const quote = input.configuration ? calculatePrice(input.configuration) : null;
  if (input.configuration && !quote) throw new Error('Эта комплектация недоступна. Обновите расчёт или отправьте вопрос без расчёта.');
  return { id: input.requestId, name, phone, message, topic, quote };
}
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
async function hash(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function readBody(request) {
  if (!request.body) throw new Error('Пустая заявка.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new Error('Слишком большой запрос.'); }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(result));
}

export async function handleLead(request, db) {
  const url = new URL(request.url);
  if (request.method !== 'POST') return json({error:'Метод не поддерживается.'},405);
  if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return json({error:'Отправьте заявку со страницы сайта.'},403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'Некорректный формат запроса.'},415);
  if (Number(request.headers.get('content-length')) > 8192) return json({error:'Слишком большой запрос.'},413);
  let lead;
  try { lead = validateLead(await readBody(request)); }
  catch (error) { return json({error:error instanceof SyntaxError ? 'Некорректный формат заявки.' : error.message},400); }
  if (!db) return json({error:'Приём заявок временно недоступен. Повторите позже.'},503);
  try {
    const fingerprint = await hash(JSON.stringify(lead));
    const existing = await db.prepare('SELECT id, request_hash FROM leads WHERE id = ?').bind(lead.id).first();
    if (existing) return existing.request_hash === fingerprint ? json({id:existing.id,status:'stored'}) : json({error:'Этот номер запроса уже использован. Обновите страницу.'},409);
    const now = Date.now();
    const ipHash = await hash(`${new Date(now).toISOString().slice(0,10)}:${request.headers.get('cf-connecting-ip') || 'local-preview'}`);
    const result = await db.prepare(`INSERT INTO leads (id, created_at, name, phone, topic, message, quote_json, ip_hash, consent_version, request_hash)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM leads WHERE ip_hash = ? AND created_at > ?) < 8
      ON CONFLICT(id) DO NOTHING`).bind(lead.id,now,lead.name,lead.phone,lead.topic,lead.message,lead.quote?JSON.stringify(lead.quote):null,ipHash,consentVersion,fingerprint,ipHash,now-3600000).run();
    if (!result.meta.changes) {
      const duplicate = await db.prepare('SELECT id, request_hash FROM leads WHERE id = ?').bind(lead.id).first();
      if (duplicate) return duplicate.request_hash === fingerprint ? json({id:lead.id,status:'stored'}) : json({error:'Этот номер запроса уже использован. Обновите страницу.'},409);
      return json({error:'Слишком много заявок. Попробуйте через час.'},429);
    }
    return json({id:lead.id,status:'stored'},201);
  } catch { return json({error:'Не удалось сохранить заявку. Данные формы сохранены на экране — попробуйте ещё раз.'},503); }
}
