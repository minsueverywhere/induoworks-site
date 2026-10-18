import test from 'node:test';
import assert from 'node:assert/strict';
import {createMusicSession} from '../src/scripts/site-music.mjs';
import { createVillageMusic, createBufferMusic, musicTime } from '../src/scripts/village-music.mjs';

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

function bufferFixture(fetcher){
 const nodes=[],states=[],updates=[];let requests=0,contexts=0,tick,closed=false;
 const context={currentTime:0,destination:{},resume:async()=>{},suspend:async()=>{},close:async()=>{closed=true;},decodeAudioData:async()=>({duration:1.03}),createGain:()=>({gain:{value:0},connect(){},disconnect(){}}),createBufferSource:()=>{const n={connect(){},disconnect(){},start(...args){this.args=args;},stop(){this.stopped=true;}};nodes.push(n);return n;}};
 const player=createBufferMusic({sources:{ogg:'/a.ogg',mp3:'/a.mp3'},loopDuration:1,onState:s=>states.push(s),onProgress:p=>updates.push(p),createContext:()=>{contexts++;return context;},fetcher:async(...args)=>{requests++;return fetcher?fetcher(...args):new Response(new Uint8Array([1]));},setTimer:fn=>{tick=fn;return 1;},clearTimer(){tick=null;}});
 return{player,context,nodes,states,updates,get requests(){return requests;},get contexts(){return contexts;},get tick(){return tick;},get closed(){return closed;}};
}
test('buffer looping is lazy and uses audio-engine loop points without a timer to restart each lap',async()=>{
 const f=bufferFixture();assert.equal(f.requests,0);assert.equal(f.contexts,0);await f.player.toggle();assert.equal(f.requests,1);assert.equal(f.nodes[0].loop,true);assert.equal(f.nodes[0].loopEnd,1);assert.deepEqual(f.nodes[0].args,[0,0]);
 f.context.currentTime=5.25;f.tick();assert.equal(f.updates.at(-1).current,.25);assert.equal(f.nodes.length,1);
 f.player.stop();assert.equal(f.nodes[0].stopped,true);assert.equal(f.tick,null);await f.player.toggle();assert.equal(f.requests,1);assert.equal(f.nodes.length,2);assert.equal(f.nodes[1].args[1],.25);
 f.player.seek(.6);assert.equal(f.nodes[2].args[1],.6);f.player.dispose();assert.equal(f.closed,true);assert.equal(f.tick,null);
});
test('pausing during decode cannot start stale audio and source failures try the alternate encoding',async()=>{
 let resolve;const f=bufferFixture(()=>new Promise(done=>resolve=done)),pending=f.player.toggle();f.player.stop();resolve(new Response(new Uint8Array([1])));await pending;assert.equal(f.nodes.length,0);assert.notEqual(f.states.at(-1),'playing');await f.player.toggle();assert.equal(f.nodes.length,1);f.player.dispose();
 let calls=0;const fallback=bufferFixture(async()=>++calls===1?new Response('',{status:404}):new Response(new Uint8Array([1])));await fallback.player.toggle();assert.equal(fallback.requests,2);assert.equal(fallback.states.at(-1),'playing');fallback.player.dispose();
});
test('switching music and closing release the previous decoded player',async()=>{
 const players=[];const session=createMusicSession(()=>{const p={disposeCount:0,toggle:async()=>{},stop(){},dispose(){this.disposeCount++;}};players.push(p);return p;});
 await session.toggle({sources:{ogg:'/one.ogg'},duration:1});await session.toggle({sources:{ogg:'/two.ogg'},duration:1});assert.equal(players[0].disposeCount,1);session.close();assert.equal(players[1].disposeCount,1);
});
