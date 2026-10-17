const stops=[
  [0,[9,27,40],[37,59,70],1],
  [5,[20,40,58],[91,105,117],.7],
  [7,[137,166,178],[239,213,180],0],
  [10,[214,232,230],[245,235,213],0],
  [16,[206,226,225],[242,229,204],0],
  [19,[83,108,132],[215,162,133],.15],
  [21,[22,49,68],[60,77,91],1],
  [24,[9,27,40],[37,59,70],1],
];
export function villageSky(date=new Date()){
  const hour=date.getHours()+date.getMinutes()/60;
  const next=stops.findIndex(stop=>stop[0]>hour),a=stops[next-1],b=stops[next],t=(hour-a[0])/(b[0]-a[0]);
  const mix=(x,y)=>x.map((value,i)=>Math.round(value+(y[i]-value)*t));
  const stars=a[3]+(b[3]-a[3])*t;
  return {background:`linear-gradient(180deg,rgb(${mix(a[1],b[1]).join(',')}),rgb(${mix(a[2],b[2]).join(',')}))`,stars,ink:hour<7||hour>=19?'#eddfc7':'#526347'};
}
