import tariffs from '../data/tariffs.json' with { type: 'json' };
export { tariffs };
export function calculatePrice(input, rateTable = tariffs) {
  if (!input || typeof input !== 'object') return null;
  const {width,height,color,surface,drive,installation,delivery}=input;
  if (!Number.isInteger(width) || width<2000 || width>6000 || !Number.isInteger(height) || height<1800 || height>3500 || typeof installation!=='boolean') return null;
  for (const [table,key] of [[rateTable.colors,color],[rateTable.surfaces,surface],[rateTable.drives,drive],[rateTable.delivery,delivery]]) {
    if (typeof key!=='string' || !Object.hasOwn(table,key)) return null;
  }
  const items=[
    {label:`Полотно и система · ${width} × ${height} мм`,amount:rateTable.base+Math.round(width*height*rateTable.perSquareMeter/1000000)},
    {label:rateTable.colors[color].label,amount:rateTable.colors[color].price},
    {label:rateTable.surfaces[surface].label,amount:rateTable.surfaces[surface].price},
    {label:rateTable.drives[drive].label,amount:rateTable.drives[drive].price},
    {label:installation?'Стандартный монтаж':'Без монтажа',amount:installation?rateTable.installation:0},
    {label:rateTable.delivery[delivery].label,amount:rateTable.delivery[delivery].price}
  ];
  return {configuration:{width,height,color,surface,drive,installation,delivery},items,price:items.reduce((sum,item)=>sum+item.amount,0),demo:Boolean(rateTable.demo),currency:'RUB',tariffVersion:rateTable.version};
}
