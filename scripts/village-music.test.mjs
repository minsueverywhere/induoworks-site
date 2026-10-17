import test from 'node:test';
import assert from 'node:assert/strict';
import { createVillageMusic, musicTime } from '../src/scripts/village-music.mjs';
import { musicArtist } from '../src/scripts/village-tracks.mjs';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('music is requested only on play, loops, and prefers Opus', async () => {
  let created = 0, audio;
  const states = [];
  const createAudio = () => { created++; audio = { canPlayType: t => t.includes('opus') ? 'probably' : '', addEventListener() {}, play: async () => {}, pause() {} }; return audio; };
  const music = createVillageMusic({ sources: { ogg: '/a.ogg', mp3: '/a.mp3' }, onState: s => states.push(s), createAudio });
  assert.equal(created, 0);
  await music.toggle();
  assert.equal(audio.src, '/a.ogg'); assert.equal(audio.loop, true); assert.equal(audio.preload, 'none');
  await music.toggle();
  assert.deepEqual(states, ['loading', 'playing', 'stopped']);
});
test('playback reports elapsed time and seeking clamps without preloading music',async()=>{
  const events=new Map(),updates=[];let created=0;
  const audio={duration:64,currentTime:0,canPlayType:()=>'',addEventListener:(name,fn)=>events.set(name,fn),play:async()=>{},pause(){}};
  const player=createVillageMusic({sources:{ogg:'/loop.ogg',mp3:'/loop.mp3'},onState(){},onProgress:p=>updates.push(p),createAudio:()=>{created++;return audio;}});
  player.seek(20);assert.equal(created,0);
  await player.toggle();assert.equal(audio.src,'/loop.mp3');
  audio.currentTime=12.3;events.get('timeupdate')();assert.deepEqual(updates.at(-1),{current:12.3,duration:64});
  player.seek(32);assert.equal(audio.currentTime,32);
  player.seek(100);assert.equal(audio.currentTime,64);
  player.seek(-4);assert.equal(audio.currentTime,0);
  player.seek(NaN);assert.equal(audio.currentTime,0);
  audio.duration=NaN;player.seek(9);assert.equal(audio.currentTime,0);
  assert.equal(musicTime(64),'1:04');assert.equal(musicTime(12.3),'0:12');assert.equal(musicTime(NaN),'0:00');
});
test('switching artist refreshes the player and late progress from the previous song is ignored',()=>{
  const source=readFileSync(new URL('../src/scripts/village.js',import.meta.url),'utf8'),options=[],nodes=new Map();
  const first={title:'Loop',artist:'First team',project:'Game',duration:64,sources:{ogg:'/loop.ogg',mp3:'/loop.mp3'}};
  runInNewContext(source.slice(source.indexOf('let playing = false;'),source.indexOf('const decorationObject='))+"\nselectMusic(second);",{
    root:{dataset:{music:JSON.stringify(first)}},second:{...first,artist:'Second team'},text:{},musicArtist,musicTime,
    $:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);},createVillageMusic:o=>{options.push(o);return{stop(){}};},
  });
  assert.equal(options.length,2);
  options[0].onProgress({current:20,duration:64});assert.equal(nodes.get('seek').value,'0');
  nodes.get('seek').setAttribute=()=>{};options[1].onProgress({current:12,duration:64});
  assert.equal(nodes.get('seek').value,'12');assert.equal(nodes.get('time').textContent,'0:12 / 1:04');
});
