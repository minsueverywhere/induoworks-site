import { CONTENT_ORIGIN, validateCatalog, resolveMedia } from '../content-schema.mjs';

// One validated request per navigation; embedded HTML remains usable on failure or without JS.
let pending;
export async function fetchContent(fetcher=fetch) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2500);
  try {
    const response=await fetcher(CONTENT_ORIGIN+'/catalog.json', {signal:controller.signal});
    if (!response.ok) throw new Error('Content unavailable');
    const raw=await response.text();
    if (raw.length>1024*1024) throw new Error('Content too large');
    return resolveMedia(validateCatalog(JSON.parse(raw)), CONTENT_ORIGIN);
  } catch { return null; }
  finally { clearTimeout(timer); }
}
export function loadContent() {
  if (pending) return pending;
  const embedded = import.meta.env?.PUBLIC_CONTENT_MODE === 'embedded' || new URLSearchParams(location.search).get('content') === 'embedded';
  if (embedded) return Promise.resolve(null);
  pending=fetchContent();
  return pending;
}

if(typeof document!=='undefined')document.addEventListener('astro:before-preparation',()=>{pending=null;});
