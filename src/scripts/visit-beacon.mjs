// Counts page views for the host's visit stats. The browser keeps a random ID (no personal data);
// a "visit" is the first page of a browser session.
const DEVICE='induo-device',SESSION='induo-visit',EXCLUDED='induo-visit-exclude';
function deviceId(){
  try{let id=localStorage.getItem(DEVICE);if(!/^[0-9a-f-]{36}$/.test(id||'')){id=crypto.randomUUID();localStorage.setItem(DEVICE,id);}return id;}
  catch{return null;}
}
function firstInSession(){try{if(sessionStorage.getItem(SESSION))return false;sessionStorage.setItem(SESSION,'1');return true;}catch{return false;}}
function excluded(){try{return localStorage.getItem(EXCLUDED)==='1';}catch{return false;}}
// The session cookie goes along so the server can recognise a host; a host's browser then stops counting itself.
export function sendVisit(send=fetch){
  if(excluded())return;
  const device=deviceId();if(!device)return;
  send('/api/studio/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device,visit:firstInSession()}),keepalive:true,credentials:'same-origin'})
    .then(response=>{if(response.headers.get('X-Visit-Excluded')){try{localStorage.setItem(EXCLUDED,'1');}catch{/* Counted again next time if storage is blocked. */}}})
    .catch(()=>{});
}
if(typeof document!=='undefined'&&!import.meta.env?.DEV)document.addEventListener('astro:page-load',()=>sendVisit());
