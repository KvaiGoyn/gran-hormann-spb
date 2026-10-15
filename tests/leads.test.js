import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleLead, validateLead } from '../server/leads.js';
const sample = {width:3000,height:2250,color:'anthracite',surface:'smooth',drive:'standard',installation:true,delivery:'spb'};
function database(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(new URL('../drizzle/0000_robust_toro.sql',import.meta.url),'utf8'));
 const db={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)},async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:r.changes}}}}}}}};
 return {db,sqlite};
}
const input=()=>({requestId:crypto.randomUUID(),name:'Тест формы',phone:'+7 (999) 000-00-00',message:'Автоматический тест, не клиент',topic:'Ворота',consent:true});
const request=(body,origin='https://example.test')=>new Request('https://example.test/api/leads',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
test('lead is saved, quote is recalculated, retry is idempotent',async()=>{
 const {db,sqlite}=database();const body={...input(),configuration:{...sample,price:1}};
 assert.equal((await handleLead(request(body),db)).status,201);
 assert.equal((await handleLead(request(body),db)).status,200);
 const rows=sqlite.prepare('SELECT * FROM leads').all();assert.equal(rows.length,1);assert.equal(JSON.parse(rows[0].quote_json).price,134375);
 assert.equal((await handleLead(request({...body,name:'Другое имя'}),db)).status,409);
 sqlite.close();
});
test('trust boundary rejects bad consent, phones, body, origin and forged configuration',async()=>{
 const {db,sqlite}=database();
 for(const change of [{consent:false},{phone:'abc'},{name:''},{message:'x'.repeat(1501)},{configuration:{price:1}},{website:'bot'}])assert.equal((await handleLead(request({...input(),...change}),db)).status,400);
 assert.equal((await handleLead(request(input(),'https://evil.example'),db)).status,403);
 assert.equal((await handleLead(new Request('https://example.test/api/leads'),db)).status,405);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM leads').get().n,0);sqlite.close();
});
test('rate limit persists in database and errors never claim success',async()=>{
 const {db,sqlite}=database();
 for(let i=0;i<8;i++)assert.equal((await handleLead(request(input()),db)).status,201);
 assert.equal((await handleLead(request(input()),db)).status,429);
 assert.equal((await handleLead(request(input()),null)).status,503);
 sqlite.close();
});
test('malformed, oversized bodies and storage errors never report a saved lead',async()=>{
 const {db,sqlite}=database();
 const headers={origin:'https://example.test','content-type':'application/json'};
 assert.equal((await handleLead(new Request('https://example.test/api/leads',{method:'POST',headers,body:'{bad'}),db)).status,400);
 assert.equal((await handleLead(new Request('https://example.test/api/leads',{method:'POST',headers:{...headers,'content-length':'9000'},body:'{}'}),db)).status,413);
 assert.equal((await handleLead(new Request('https://example.test/api/leads',{method:'POST',headers,body:' '.repeat(9000)}),db)).status,400);
 const brokenDb={prepare(){throw new Error('private database details');}};
 const response=await handleLead(request(input()),brokenDb);assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private database details'));
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM leads').get().n,0);sqlite.close();
});
