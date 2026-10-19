// Counts page views for the host's visit stats. The browser keeps a random ID (no personal data);
// a "visit" is the first page of a browser session.
const DEVICE='induo-device',SESSION='induo-visit';
function deviceId(){
  try{let id=localStorage.getItem(DEVICE);if(!/^[0-9a-f-]{36}$/.test(id||'')){id=crypto.randomUUID();localStorage.setItem(DEVICE,id);}return id;}
  catch{return null;}
}
function firstInSession(){try{if(sessionStorage.getItem(SESSION))return false;sessionStorage.setItem(SESSION,'1');return true;}catch{return false;}}
export function sendVisit(send=fetch){
  const device=deviceId();if(!device)return;
  send('/api/studio/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device,visit:firstInSession()}),keepalive:true,credentials:'omit'}).catch(()=>{});
}
if(typeof document!=='undefined'&&!import.meta.env?.DEV)document.addEventListener('astro:page-load',()=>sendVisit());
