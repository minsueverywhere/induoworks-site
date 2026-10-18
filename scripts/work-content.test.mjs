import test from 'node:test';
import assert from 'node:assert/strict';
import { projects, workers, worksByWorker, villageNotices } from '../src/config.ts';
import { villageMedia } from '../src/village-media.ts';
import { matchesWork } from '../src/scripts/work-filter.mjs';
import { stat } from 'node:fs/promises';
import { MAX_FILE_BYTES } from '../src/content-schema.mjs';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

test('project thumbnails are valid lightweight web assets', async () => {
  for (const project of projects) {
    const image=project.thumbnail;if(!image)continue;
    assert.match(image.src,/^\/(?:work\/media|uploads)\/[a-z0-9-]+\.(?:webp|png|jpe?g|avif|gif)$/);
    let file=new URL('../content/files'+image.src,import.meta.url);
    if(!await stat(file).catch(()=>null))file=new URL('../public'+image.src,import.meta.url);
    const metadata=await sharp(fileURLToPath(file)).metadata();
    assert.ok(['webp','png','jpeg','avif','heif','gif'].includes(metadata.format));
    assert.equal(metadata.width,image.width);assert.equal(metadata.height,image.height);
    assert.ok((await stat(file)).size<=MAX_FILE_BYTES,'thumbnail exceeds upload limit');
    assert.ok(image.alt.en&&image.alt.ko&&image.caption.en&&image.caption.ko);
  }
});

test('content IDs and ownership references stay valid across pages', () => {
  const workerIds = workers.map(w=>w.id), mediaIds = villageMedia.map(m=>m.id);
  for (const ids of [workerIds,mediaIds,projects.map(p=>p.slug),villageNotices.map(n=>n.id)]) {
    assert.equal(new Set(ids).size,ids.length,'duplicate content ID');
    assert.ok(ids.every(id=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)),'unsafe content ID');
  }
  for (const entry of [...projects,...villageMedia]) {
    for (const id of entry.workerIds||[]) assert.ok(workerIds.includes(id),'unknown owner: '+id);
  }
  for (const worker of workers) {
    assert.ok(!('works' in worker),'owned titles must be derived, not copied');
    if (worker.logoMediaId) assert.ok(mediaIds.includes(worker.logoMediaId),'unknown logo');
    if (worker.house) assert.ok([worker.house.x,worker.house.y].every(n=>Number.isInteger(n)&&n>=0&&n<24),'house outside village');
  }
  assert.deepEqual(worksByWorker('missing-worker'),[]);
  for(const notice of villageNotices)assert.ok(notice.title.en&&notice.title.ko&&notice.body.en&&notice.body.ko,'notice needs bilingual copy');
});

test('search combines normalized words and all selected properties', () => {
  const entry={search:'GRENCH BOSS Frondward Godot 개발 중',kind:'game',status:'in-progress',workerIds:['frondward'],tags:['Godot']};
  assert.equal(matchesWork(entry,{}),true);
  assert.equal(matchesWork(entry,{q:'ｇｒｅｎｃｈ  개발',worker:'frondward',kind:'game',status:'in-progress',tag:'Godot'}),true);
  for (const filters of [{q:'grench missing'},{worker:'unknown'},{kind:'artwork'},{status:'paused'},{tag:'Logo'}]) {
    assert.equal(matchesWork(entry,filters),false,JSON.stringify(filters));
  }
  assert.equal(matchesWork({...entry,workerIds:[]},{worker:'frondward'}),false);
  assert.equal(matchesWork({...entry,tags:[]},{tag:'Godot'}),false);
});
