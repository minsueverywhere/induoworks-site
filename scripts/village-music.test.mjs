import test from 'node:test';
import assert from 'node:assert/strict';
import { createVillageMusic, musicTime } from '../src/scripts/village-music.mjs';

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
test('one lazy music session survives UI detach, resumes the same source and ignores old-song progress',async()=>{
  const {createMusicSession}=await import('../src/scripts/site-music.mjs');const audios=[];
  const session=createMusicSession(options=>createVillageMusic({...options,createAudio:()=>{const events={};const a={duration:64,currentTime:0,pauses:0,canPlayType:()=>true,addEventListener:(name,fn)=>events[name]=fn,play:async()=>{},pause(){this.pauses++;},events};audios.push(a);return a;}}));
  const first={title:'Loop',artist:'Team',duration:64,sources:{ogg:'/loop.ogg'}};
  let update;const unsubscribe=session.subscribe(value=>update=value);assert.equal(audios.length,0);assert.equal(update.visible,false);
  await session.toggle(first);audios[0].currentTime=17;audios[0].events.timeupdate();unsubscribe();assert.equal(audios[0].pauses,0);
  let returned;const leave=session.subscribe(value=>returned=value);assert.equal(returned.current,17);assert.equal(returned.state,'playing');
  await session.toggle({...first,artist:'New credit'});assert.equal(audios.length,1);assert.equal(session.snapshot().track.artist,'New credit');assert.equal(session.snapshot().state,'stopped');
  await session.toggle();assert.equal(audios[0].currentTime,17);
  await session.toggle({...first,title:'Other',sources:{ogg:'/other.ogg'}});assert.equal(audios.length,2);audios[0].currentTime=55;audios[0].events.timeupdate();assert.equal(session.snapshot().current,0);
  session.seek(12);assert.equal(audios[1].currentTime,12);session.close();assert.equal(session.snapshot().visible,false);assert.equal(session.snapshot().track,null);leave();
});

test('late play completion cannot restart a paused song',async()=>{
  let finish,paused=0;const states=[];
  const audio={canPlayType:()=>true,addEventListener(){},play:()=>new Promise(resolve=>{finish=resolve;}),pause(){paused++;}};
  const player=createVillageMusic({sources:{ogg:'/slow.ogg'},onState:s=>states.push(s),createAudio:()=>audio});
  const pending=player.toggle();player.stop();finish();await pending;
  assert.ok(paused>=2);assert.equal(states.includes('playing'),false);
});
