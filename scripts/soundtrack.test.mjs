import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {soundtracks,soundtrackChoices,musicWorkPath} from '../src/scripts/village-tracks.mjs';
import {contentWorks} from '../src/scripts/content-catalog.mjs';
import {createBufferMusic,createCompressedMusic} from '../src/scripts/village-music.mjs';
const catalog=JSON.parse(await readFile(new URL('../content/catalog.json',import.meta.url),'utf8'));

test('compressed songs load once, seek through the entire file and release the blob on close',async()=>{
  let fetched=0,played=0,revoked,ended=0;const events={},audio={duration:64,currentTime:0,canPlayType:()=>true,addEventListener:(key,fn)=>events[key]=fn,play:async()=>played++,pause(){},removeAttribute(){},load(){}};
  const player=createCompressedMusic({sources:{ogg:'/song.ogg'},loop:false,onEnded:()=>ended++,onState(){},createAudio:()=>audio,fetcher:async()=>{fetched++;return new Response(new Uint8Array([1,2,3]));},createURL:blob=>{assert.equal(blob.size,3);return 'blob:song';},revokeURL:url=>revoked=url});
  assert.equal(fetched,0);await player.toggle();assert.equal(audio.src,'blob:song');assert.equal(audio.loop,false);player.seek(60);assert.equal(audio.currentTime,60);player.stop();await player.toggle();assert.equal(fetched,1);assert.equal(played,2);
  events.ended();assert.equal(ended,1);await player.toggle();assert.equal(played,3);player.dispose();assert.equal(revoked,'blob:song');
});

test('cancelling a compressed download never starts playback and closing aborts it',async()=>{
  let finish,signal,played=0;const audio={canPlayType:()=>false,play:async()=>played++,addEventListener(){},pause(){}};
  const player=createCompressedMusic({sources:{mp3:'/song.mp3'},onState(){},createAudio:()=>audio,fetcher:(_url,options)=>{signal=options.signal;return new Promise(resolve=>finish=resolve);},createURL:()=>{throw Error('must not create after disposal');}});
  const pending=player.toggle();player.stop();player.dispose();finish(new Response(new Uint8Array([1])));await pending;assert.equal(signal.aborted,true);assert.equal(played,0);
});

test('six tracks share one soundtrack in Works and Workers while a different owner remains separate',()=>{
  const groups=soundtracks(catalog),works=contentWorks(catalog,'ko').filter(w=>w.kind==='music');
  assert.equal(groups.length,1);assert.equal(groups[0].tracks.length,6);assert.equal(works.length,1);assert.equal(works[0].file,false);
  for(const track of groups[0].tracks){const link=new URL(musicWorkPath(track,'ko'),'https://induo.works');assert.equal(link.searchParams.get('id'),groups[0].id);assert.equal(link.hash,'#track-'+track.id);}
  const other=structuredClone(catalog);other.tracks.push({...other.tracks[0],id:'other-owner',workerIds:['induo-works']});assert.equal(soundtracks(other).length,2);
  const choices=soundtrackChoices(catalog,[['music:legacy','Sunlit Circuit'],['music:veiled-garden','Veiled Garden']]);assert.equal(choices.length,1);assert.equal(choices[0].choices.length,2);
});

test('a soundtrack track ends once and notifies sequence playback; pausing never advances it',async()=>{
  const nodes=[];let ended=0;
  const context={currentTime:0,destination:{},resume:async()=>{},suspend:async()=>{},createGain:()=>({gain:{},connect(){}}),decodeAudioData:async()=>({duration:1}),createBufferSource(){const node={connect(){},disconnect(){},start(){},stop(){}};nodes.push(node);return node;}};
  const player=createBufferMusic({sources:{mp3:'/song.mp3'},loopDuration:1,loop:false,onEnded:()=>ended++,onState(){},createContext:()=>context,fetcher:async()=>new Response(new Uint8Array([1])),setTimer:()=>1,clearTimer(){}});
  await player.toggle();assert.equal(nodes[0].loop,false);player.stop();assert.equal(ended,0);assert.equal(nodes[0].onended,null);
  await player.toggle();nodes[1].onended();assert.equal(ended,1);
});

test('unsupported buffer decoding uses the native compressed player and forwards seek and disposal',async()=>{
  let playing=0,seek,disposed=0;
  const player=createBufferMusic({sources:{ogg:'/song.ogg'},onState(){},createContext:()=>({destination:{},resume:async()=>{},suspend:async()=>{},close:async()=>{},createGain:()=>({gain:{},connect(){},disconnect(){}}),decodeAudioData:async()=>{throw Error('unsupported');}}),fetcher:async()=>new Response(new Uint8Array([1])),createFallback:()=>({toggle:async()=>playing++,stop(){},seek:value=>seek=value,dispose:()=>disposed++})});
  await player.toggle();assert.equal(playing,1);player.seek(30);assert.equal(seek,30);player.dispose();assert.equal(disposed,1);
});

test('room entrance waits for live layout and delayed responses cannot overwrite a different room',async()=>{
  const source=await readFile(new URL('../src/scripts/village.js',import.meta.url),'utf8');
  const visits=source.slice(source.indexOf('function visit('),source.indexOf("$('close').addEventListener"));
  let finish;const actions=[],context={places:[{id:'frondward',shape:'house'}],workers:[{id:'frondward'}],tutorialStep:null,refreshPublicRoom:()=>new Promise(resolve=>finish=resolve),changeArea:area=>actions.push(area),tutorial:{complete(){}}};
  const pending=vm.runInNewContext(visits+"visit('frondward');",context);assert.deepEqual(actions,[]);finish();await pending;assert.deepEqual(actions,['room']);
  const second=vm.runInNewContext(visits+"visit('frondward');",context);context.activeWorker={id:'other'};finish();await second;assert.equal(actions.length,1);
});
