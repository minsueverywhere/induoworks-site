// Host-only visit stats page: renders the totals and the last 30 days from the stats API.
import {onPage} from './page-lifecycle.mjs';
onPage('visit-stats',async(root,life)=>{
  const status=root.querySelector('#stats-status'),total=root.querySelector('#stats-total'),table=root.querySelector('#stats-days');
  const response=await fetch('/api/studio/visit-stats',{cache:'no-store',signal:life.signal}).catch(()=>null);
  const data=await response?.json().catch(()=>null);
  if(!response?.ok||!data){status.textContent=response?.status===401?'Discord로 로그인한 호스트만 볼 수 있습니다.':data?.error||'통계를 불러오지 못했습니다.';return;}
  const number=value=>Number(value||0).toLocaleString('ko-KR');
  for(const dd of total.querySelectorAll('dd'))dd.textContent=number(data.total[dd.dataset.key]);
  table.querySelector('tbody').replaceChildren(...data.days.map(day=>{const row=document.createElement('tr');for(const key of ['day','visits','views','devices','newDevices']){const cell=document.createElement(key==='day'?'th':'td');if(key==='day')cell.scope='row';cell.textContent=key==='day'?day.day:number(day[key]);row.append(cell);}return row;}));
  status.textContent='오늘('+data.today+')까지 기록입니다.';total.hidden=false;table.hidden=!data.days.length;
});
