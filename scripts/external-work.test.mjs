import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {externalWork} from '../src/external-work.mjs';
import {mountExternal} from '../src/scripts/external-player.mjs';
import {studioSlice,mergeStudio} from '../src/server/studio-content.mjs';
import {villageContent} from '../src/scripts/village-content.mjs';
import {mediaPaths} from '../src/content-schema.mjs';
import {contentWorks} from '../src/scripts/content-catalog.mjs';

test('external URLs accept only supported services and normalize GitHub file links',()=>{
  assert.equal(externalWork('https://youtu.be/dQw4w9WgXcQ?t=4').src,'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(externalWork('https://www.youtube.com/watch?v=dQw4w9WgXcQ').provider,'YouTube');
  assert.equal(externalWork('https://soundcloud.com/artist/song?si=tracking').url,'https://soundcloud.com/artist/song');
  assert.deepEqual(externalWork('https://github.com/team/repo/blob/main/music/song.ogg?raw=true'),{provider:'GitHub',kind:'audio',url:'https://raw.githubusercontent.com/team/repo/main/music/song.ogg',src:'https://raw.githubusercontent.com/team/repo/main/music/song.ogg'});
  assert.equal(externalWork('https://raw.githubusercontent.com/team/repo/sha/art.png').kind,'image');
  for(const url of ['javascript:alert(1)','http://soundcloud.com/a/b','https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com:444/watch?v=dQw4w9WgXcQ','https://github.com/a/b','https://github.com/a/b/blob/main/x.svg','https://github.com/a/b/blob/main/x.html','https://soundcloud.com/a','https://youtu.be/bad'])assert.throws(()=>externalWork(url),url);
});

test('owned external Work survives validation, studio merge and room exhibition without becoming an uploaded file',async()=>{
  const catalog=JSON.parse(await readFile(new URL('../content/catalog.json',import.meta.url),'utf8')),slice=studioSlice(catalog,'frondward');
  const project=slice.projects[0];project.externalUrl='https://soundcloud.com/artist/song';
  slice.room.floors.push({wallHeight:90,tiles:[{x:0,y:0,type:'floor'}],exhibits:[{id:'external-display',kind:'project',ref:project.slug,x:0,y:0,width:1,depth:1}]});
  const merged=mergeStudio(catalog,'frondward',slice),places=villageContent(merged,'ko','').places;
  assert.equal(places.find(p=>p.id==='frondward:'+project.slug).externalUrl,project.externalUrl);
  assert.equal(places.find(p=>p.worldId==='external-display').externalUrl,project.externalUrl);
  assert.deepEqual(mediaPaths(merged),mediaPaths(catalog));
  const artwork=merged.projects.find(p=>p.slug===project.slug);delete artwork.thumbnail;artwork.externalUrl='https://github.com/a/b/blob/main/art.png';
  assert.equal(contentWorks(merged,'ko').find(p=>p.id==='project:'+project.slug).image,'https://raw.githubusercontent.com/a/b/main/art.png');
  project.externalUrl='https://evil.test/embed';assert.throws(()=>mergeStudio(catalog,'frondward',slice));
});

test('player is absent before click and cleanup removes loaded embeds and stops audio',()=>{
  class Element{
    constructor(tag){this.tag=tag;this.style={};this.children=[];this.events={};}
    append(...items){this.children.push(...items);}
    replaceChildren(){this.children=[];}
    querySelectorAll(tag){return this.children.filter(e=>e.tag===tag);}
    addEventListener(name,fn){this.events[name]=fn;}
    pause(){this.paused=true;}
    removeAttribute(name){delete this[name];}
    load(){this.loaded=true;}
  }
  const original=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
  try{
    const container=new Element('section'),clear=mountExternal(container,'https://youtu.be/dQw4w9WgXcQ','Test');
    assert.equal(container.children.length,1);assert.equal(container.children[0].tag,'button');assert.equal(container.children[0].src,undefined);
    container.children[0].events.click();assert.equal(container.children[0].tag,'iframe');assert.ok(container.children[0].src.startsWith('https://www.youtube-nocookie.com/'));clear();assert.equal(container.children.length,0);
    const stop=mountExternal(container,'https://github.com/a/b/blob/main/song.mp3','Song',{defer:false}),audio=container.children[0];assert.equal(audio.preload,'none');stop();assert.equal(audio.paused,true);assert.equal(audio.src,undefined);
  }finally{globalThis.document=original;}
});
