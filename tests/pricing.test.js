import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePrice } from '../server/pricing.js';
export const sample = {width:3000,height:2250,color:'anthracite',surface:'smooth',drive:'standard',installation:true,delivery:'spb'};
test('demo tariff is itemized and recalculated instead of accepting client prices', () => {
 const quote = calculatePrice({...sample,price:1});
 assert.equal(quote.price,134375);
 assert.equal(quote.demo,true);
 assert.equal(quote.items.reduce((sum,item)=>sum+item.amount,0),quote.price);
 assert.equal(quote.tariffVersion,'demo-2026-10-15');
});
test('invalid dimensions, values and types are rejected', () => {
 for(const change of [{width:1999},{width:6001},{height:3501},{height:NaN},{width:2500.5},{color:'pink'},{drive:'other'},{installation:'false'},{delivery:'moon'}])assert.equal(calculatePrice({...sample,...change}),null);
 assert.equal(calculatePrice({}),null);assert.equal(calculatePrice(null),null);
});
test('optional items and tariff boundaries calculate consistently', () => {
 const basic=calculatePrice({...sample,color:'white',drive:'none',installation:false,delivery:'pickup'});
 assert.equal(basic.price,82875);
 for(const width of [2000,6000])for(const height of [1800,3500])assert.ok(calculatePrice({...sample,width,height}).price>0);
 assert.equal(calculatePrice({...sample,color:'wood',surface:'micro'}).price,150375);
});
