import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer, get } from 'node:http';
import sharp from 'sharp';
import { createEditorStore, importEditorMedia, mediaFile, placementError } from './editor-store.mjs';
import { createEditorMiddleware, localEditorPlugin } from './editor-server.mjs';
import { validateCatalog, resolveMedia, CONTENT_ORIGIN } from '../src/content-schema.mjs';
import { villageContent } from '../src/scripts/village-content.mjs';
import { contentWorks } from '../src/scripts/content-catalog.mjs';
import { villageWorld } from '../src/scripts/village-world.mjs';
const root=new URL('../',import.meta.url);
const original=JSON.parse(await readFile(new URL('content/catalog.json',root),'utf8'));
async function fixture(t){
  const directory=await mkdtemp(join(tmpdir(),'induo-editor-test-'));
  t.after(async()=>{assert.ok(directory.startsWith(join(tmpdir(),'induo-editor-test-')));await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
  await mkdir(join(directory,'content'),{recursive:true});
  await writeFile(join(directory,'content/catalog.json'),JSON.stringify(original));
  await cp(new URL('public/',root),join(directory,'public'),{recursive:true});
  return directory;
}
test('editor save validates placement, preserves a backup and rejects stale writes',async t=>{
  const directory=await fixture(t),store=createEditorStore(directory),before=await store.read();
  const draft=structuredClone(before.catalog);draft.workers[0].house={x:4,y:2};
  assert.equal(placementError(draft.workers,draft.workers[0].id,draft.workers[0].house),'');
  await store.preview(draft);assert.equal((await store.getPreview()).workers[0].house.x,4);
  assert.equal((await store.read()).catalog.workers[0].house.x,before.catalog.workers[0].house.x,'preview must not save');
  const saved=await store.save(draft,before.revision);
  assert.deepEqual(JSON.parse(await readFile(resolve(directory,saved.backup),'utf8')),before.catalog);
  assert.notEqual(saved.revision,before.revision);
  await assert.rejects(()=>store.save(before.catalog,before.revision),e=>e.status===409);
  for(const house of [{x:10,y:10},{x:18,y:17},{x:24,y:3},draft.workers[1].house]){
    const invalid=structuredClone(draft);invalid.workers[0].house=house;
    await assert.rejects(()=>store.save(invalid,saved.revision));
  }
  const invalid=structuredClone(draft);invalid.projects[0].title.ko='';
  await assert.rejects(()=>store.save(invalid,saved.revision),/입력/);
  assert.deepEqual((await store.read()).catalog,draft,'rejected writes leave the saved content intact');
});
test('image upload creates bounded previews and refuses disguised files and traversal',async t=>{
  const directory=await fixture(t),png=await sharp({create:{width:1200,height:800,channels:3,background:'#203745'}}).png().toBuffer();
  const result=await importEditorMedia(directory,'Artwork.png',png);
  assert.equal(result.width,1200);assert.equal(result.previewWidth,640);
  assert.equal((await sharp(await readFile(await mediaFile(directory,result.badge))).metadata()).width,96);
  assert.deepEqual(await readFile(await mediaFile(directory,result.original)),png);
  await assert.rejects(()=>importEditorMedia(directory,'fake.ogg',png),/mismatched/);
  await assert.rejects(()=>importEditorMedia(directory,'loop.wav',png),/Unsupported/);
  await assert.rejects(()=>mediaFile(directory,'/uploads/../../.env'));
  await assert.rejects(()=>mediaFile(directory,'/uploads/test.svg'));
});
test('saved scene preserves multi-tile houses, painted tiles, moved signs and removed trees across reloads',async t=>{
  const directory=await fixture(t),store=createEditorStore(directory),before=await store.read(),draft=structuredClone(before.catalog);
  draft.world=villageWorld(draft);draft.world.sign={x:1,y:14};draft.world.noticeboard={x:8,y:20};
  Object.assign(draft.workers[0].house,{width:3,depth:2});
  draft.world.decorations=draft.world.decorations.filter(d=>d.id!=='tree-1');draft.world.tiles[12*24+15].type='water';
  await store.save(draft,before.revision);
  assert.deepEqual((await createEditorStore(directory).read()).catalog.world,draft.world);
  assert.deepEqual((await createEditorStore(directory).read()).catalog.workers[0].house,draft.workers[0].house);
  const invalid=structuredClone(draft);invalid.world.tiles[2*24+1].type='water';
  await assert.rejects(()=>store.preview(invalid),/물/);
});

test('saving preserves sign, noticeboard and tree lots and rejects partial overlap',async t=>{
  const directory=await fixture(t),store=createEditorStore(directory),before=await store.read(),draft=structuredClone(before.catalog);
  draft.world=villageWorld(draft);draft.world.tiles.forEach(tile=>tile.type='grass');
  Object.assign(draft.world.sign,{width:2,depth:2});Object.assign(draft.world.noticeboard,{width:3,depth:2});
  draft.world.decorations=[{id:'tree-custom',type:'tree',x:18,y:18,size:1,width:2,depth:3}];
  await store.save(draft,before.revision);assert.deepEqual((await createEditorStore(directory).read()).catalog.world,draft.world);
  const invalid=structuredClone(draft);invalid.world.sign={x:17,y:17,width:2,depth:2};
  await assert.rejects(()=>store.preview(invalid),/겹/);
  assert.deepEqual((await store.read()).catalog.world,draft.world);
});
test('local HTTP editor requires a loopback Host, same origin and session token; deployment is explicit',async t=>{
  const directory=await fixture(t);let deploys=0;
  const middleware=createEditorMiddleware(directory,{deploy:async()=>{deploys++;return 'content only';}});
  const server=createServer((req,res)=>void middleware(req,res,()=>{res.writeHead(404);res.end();}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port;
  const html=await(await fetch(origin+'/__editor/')).text(),token=html.match(/name="editor-token" content="([a-f0-9]+)"/)[1];
  const post=(path,payload,headers={})=>fetch(origin+'/__editor/'+path,{method:'POST',headers:{Origin:origin,'X-Editor-Token':token,...headers},body:JSON.stringify(payload)});
  const saved=await(await fetch(origin+'/__editor/catalog')).json();
  assert.equal(await new Promise((resolve,reject)=>get(origin+'/__editor/',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject)),403);
  assert.equal((await post('save',{catalog:original,revision:saved.revision},{Origin:'https://evil.example'})).status,403);
  assert.equal((await post('save',{catalog:original,revision:saved.revision},{'X-Editor-Token':'wrong'})).status,403);
  assert.equal((await post('deploy',{revision:'stale'})).status,409);assert.equal(deploys,0);
  assert.equal((await post('preview',{catalog:original})).status,200);assert.equal(deploys,0);
  assert.equal((await post('save',{catalog:original,revision:saved.revision})).status,200);assert.equal(deploys,0);
  const latest=await(await fetch(origin+'/__editor/catalog')).json();
  assert.equal((await post('deploy',{revision:latest.revision})).status,200);assert.equal(deploys,1);
  assert.equal((await post('save',{data:'x'.repeat(1024*1024)})).status,413);
  assert.equal((await fetch(origin+'/__editor/../../.env')).status,404);
});
test('new music is shared by Works and the assigned house while legacy content still works',()=>{
  const data=structuredClone(original);data.tracks=[{...structuredClone(data.music),id:'new-track',title:'New track',workerIds:['frondward']}];
  data.workers.find(w=>w.id==='frondward').musicId='new-track';
  validateCatalog(data);
  const room=villageContent(resolveMedia(data,CONTENT_ORIGIN),'ko','Induohood');
  assert.equal(room.places.find(p=>p.id==='frondward-jukebox').music.title,'New track');
  assert.equal(room.places.find(p=>p.id==='induo-works-jukebox').music.title,original.music.title);
  assert.equal(contentWorks(data,'ko').find(p=>p.id==='music:new-track').creators[0].id,'frondward');
  data.musicId='new-track';assert.equal(villageContent(data,'ko','Induohood').music.title,'New track');
  data.workers[0].musicId='missing';assert.throws(()=>validateCatalog(data),/Unknown workshop music/);
});
test('editor bridge transforms only the map during dev and does not enter normal production code',async()=>{
  const source=await readFile(new URL('src/scripts/village.js',root),'utf8'),plugin=localEditorPlugin();
  assert.equal(plugin.apply,'serve');assert.equal(await plugin.transform(source,'other.js'),undefined);
  const transformed=await plugin.transform(source,'F:/repo/src/scripts/village.js');
  assert.match(transformed.code,/fetch\('\/__editor\/preview\?t='/);
  assert.match(transformed.code,/source:'induo-map'/);
  assert.match(transformed.code,/drawEditorOverlay\(\); positionWallLinks/);
  assert.ok(!transformed.code.includes('const remoteContent=await loadContent();'));
  assert.ok(!source.includes('/__editor/'));
});
