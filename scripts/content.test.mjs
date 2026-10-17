import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, resolveMedia, CONTENT_ORIGIN, MAX_FILE_BYTES } from '../src/content-schema.mjs';
import { validateMediaFile } from './content-files.mjs';
import { villageContent } from '../src/scripts/village-content.mjs';
import { contentWorks, projectPath } from '../src/scripts/content-catalog.mjs';
import { fetchContent } from '../src/scripts/content-loader.mjs';
const original=JSON.parse(await readFile(new URL('../content/catalog.json',import.meta.url),'utf8'));

test('content outage, invalid JSON and incompatible data preserve the embedded view',async()=>{
  const valid=await fetchContent(async()=>new Response(JSON.stringify(original)));
  assert.equal(valid.workers[0].id,original.workers[0].id);
  assert.ok(valid.music.sources.ogg.startsWith(CONTENT_ORIGIN));
  for(const fetcher of [()=>{throw new Error('offline');},async()=>new Response('',{status:503}),async()=>new Response('<html>'),async()=>new Response('{"version":99}')])assert.equal(await fetchContent(fetcher),null);
});

test('one catalog updates workers, village, ownership and new project links together',()=>{
  const data=structuredClone(original);
  data.workers.push({id:'new-studio',name:'New studio',description:{en:'Hello',ko:'안녕'},house:{x:18,y:5}});
  data.projects.push({...structuredClone(data.projects[1]),slug:'new-game',workerIds:['new-studio']});
  validateCatalog(data);
  const village=villageContent(data,'ko','Induohood'),works=contentWorks(data,'ko');
  assert.ok(village.places.some(p=>p.id==='new-studio'));
  const stand=village.places.find(p=>p.id==='new-studio:new-game');
  assert.equal(stand.links[0].href,projectPath('new-game','ko'));
  assert.equal(works.find(p=>p.id==='project:new-game').creators[0].name,'New studio');
  assert.equal(village.places.filter(p=>p.owner==='new-studio'&&p.shape==='game').length,1);
});

test('catalog rejects unsafe URLs, broken ownership and unsupported schema',()=>{
  for(const change of [d=>d.version=2,d=>d.workers.push(d.workers[0]),d=>d.projects[0].href='javascript:alert(1)',d=>d.projects[0].workerIds=['missing'],d=>d.music.sources.ogg='/music.wav',d=>d.workers[0].house.x=30,d=>d.projects[0].thumbnail={src:'//evil.example/x.png'},d=>d.workers=d.workers.slice(1)]) {
    const data=structuredClone(original);change(data);assert.throws(()=>validateCatalog(data));
  }
  const resolved=resolveMedia(validateCatalog(original),CONTENT_ORIGIN);
  const oversized=structuredClone(original);
  oversized.notices=Array.from({length:100},(_,i)=>({id:'notice-'+i,title:{en:'Notice',ko:'공지'},body:{en:'x'.repeat(10000),ko:'x'.repeat(10000)}}));
  assert.throws(()=>validateCatalog(oversized),/catalog exceeds/);
  assert.ok(resolved.music.sources.ogg.startsWith(CONTENT_ORIGIN+'/'));
  assert.ok(original.music.sources.ogg.startsWith('/'),'resolving must not mutate fallback');
});

test('upload gate rejects oversized, WAV, disguised files and accepts the actual loop',async()=>{
  const audio=await readFile(new URL('../public/village/music/sunlit-circuit-930fee2b274e.ogg',import.meta.url));
  assert.doesNotThrow(()=>validateMediaFile('loop.ogg',audio));
  assert.throws(()=>validateMediaFile('loop.wav',audio));
  assert.throws(()=>validateMediaFile('loop.ogg',Buffer.from('RIFF fake WAV')));
  assert.throws(()=>validateMediaFile('loop.mp3',Buffer.alloc(MAX_FILE_BYTES+1)));
  const mp3=await readFile(new URL('../public/village/music/sunlit-circuit-930fee2b274e.mp3',import.meta.url));
  assert.doesNotThrow(()=>validateMediaFile('loop.mp3',mp3));
});
