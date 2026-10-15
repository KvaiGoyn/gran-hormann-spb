import assert from 'node:assert/strict';
import { pageContent } from './page-content.mjs';
const origin=process.argv[2] || 'http://127.0.0.1:4173';
const routes=['/',...Object.keys(pageContent).filter(route=>route!=='/404'),'/page-does-not-exist'];
for(const route of routes){
 const response=await fetch(origin+route);assert.equal(response.status,route==='/page-does-not-exist'?404:200,route);
 const html=await response.text();assert.equal((html.match(/<h1[ >]/g)||[]).length,1,route+' has exactly one H1');
 for(const match of html.matchAll(/(?:src|href)="(\/site\/[^"#]+)"/g)){
  const asset=await fetch(origin+match[1]);assert.equal(asset.status,200,match[1]);assert.ok(!asset.headers.get('content-type')?.includes('text/html'),match[1]);
 }
 console.log(`${response.status} ${route}`);
}
const invalid=await fetch(origin+'/api/leads',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({})});assert.equal(invalid.status,400);
console.log('Routes, referenced assets and API validation passed.');
