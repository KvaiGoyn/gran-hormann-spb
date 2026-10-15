import tariffs from '../data/tariffs.json' with { type: 'json' };
export { tariffs };
export function calculatePrice(input) {
  if (!input || typeof input !== 'object') return null;
  const {width,height,color,surface,drive,installation,delivery}=input;
  if (!Number.isInteger(width) || width<2000 || width>6000 || !Number.isInteger(height) || height<1800 || height>3500 || typeof installation!=='boolean') return null;
  for (const [table,key] of [[tariffs.colors,color],[tariffs.surfaces,surface],[tariffs.drives,drive],[tariffs.delivery,delivery]]) {
    if (typeof key!=='string' || !Object.hasOwn(table,key)) return null;
  }
  const items=[
    {label:`Полотно и система · ${width} × ${height} мм`,amount:tariffs.base+Math.round(width*height*tariffs.perSquareMeter/1000000)},
    {label:tariffs.colors[color].label,amount:tariffs.colors[color].price},
    {label:tariffs.surfaces[surface].label,amount:tariffs.surfaces[surface].price},
    {label:tariffs.drives[drive].label,amount:tariffs.drives[drive].price},
    {label:installation?'Стандартный монтаж':'Без монтажа',amount:installation?tariffs.installation:0},
    {label:tariffs.delivery[delivery].label,amount:tariffs.delivery[delivery].price}
  ];
  return {configuration:{width,height,color,surface,drive,installation,delivery},items,price:items.reduce((sum,item)=>sum+item.amount,0),demo:true,currency:'RUB',tariffVersion:tariffs.version};
}
