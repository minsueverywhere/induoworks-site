export function createVillageMusic(options){
  // shortcut: long tracks stream to bound retained downloads; short loops keep only compressed bytes in JS.
  return !options.createAudio&&options.loopDuration>0&&options.loopDuration<=120?createCompressedMusic(options):createElementMusic(options);
}

export function createCompressedMusic({sources,onState,onProgress=()=>{},volume=.2,loop=true,onEnded=()=>{},createAudio=()=>new Audio(),fetcher=globalThis.fetch,createURL=blob=>URL.createObjectURL(blob),revokeURL=url=>URL.revokeObjectURL(url)}){
  let player,audio,loading,objectURL,requested=false,generation=0,disposed=false;
  const abort=new AbortController();
  const state=value=>{if(value==='stopped'||value==='error')requested=false;onState(value);};
  async function load(){
    audio=createAudio();
    const extensions=audio.canPlayType('audio/ogg; codecs="opus"')?['ogg','mp3']:['mp3','ogg'];
    for(const ext of extensions){
      if(!sources[ext])continue;
      try{
        const response=await fetcher(sources[ext],{signal:abort.signal});if(!response.ok)throw Error('Music request failed');
        const bytes=await response.blob();if(disposed)return;
        objectURL=createURL(bytes);player=createElementMusic({sources:{[ext]:objectURL},onState:state,onProgress,volume,loop,onEnded,createAudio:()=>audio});return;
      }catch(error){if(disposed||abort.signal.aborted)throw error;}
    }
    // External hosts may allow media playback but forbid fetch/CORS.
    player=createElementMusic({sources,onState:state,onProgress,volume,loop,onEnded,createAudio:()=>audio});
  }
  return {
    async toggle(){
      if(disposed)return;
      if(requested){this.stop();return;}
      requested=true;const version=++generation;onState('loading');
      try{loading??=load();await loading;if(disposed||version!==generation||!requested)return;await player.toggle();}
      catch{if(!disposed&&version===generation){requested=false;loading=null;onState('error');}}
    },
    stop(){requested=false;generation++;if(player)player.stop();else if(!disposed)onState('stopped');},
    seek(value){player?.seek(value);},
    dispose(){if(disposed)return;this.stop();disposed=true;abort.abort();player?.dispose();if(objectURL)revokeURL(objectURL);},
  };
}

// Decode only the requested track; the audio engine loops it without a main-thread timer.
export function createBufferMusic({sources,onState,onProgress=()=>{},volume=.2,loopDuration,loop=true,onEnded=()=>{},createFallback,createContext=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)({latencyHint:'playback'}),fetcher=globalThis.fetch,setTimer=globalThis.setTimeout,clearTimer=globalThis.clearTimeout}){
  let fallback,context,gain,buffer,loading,source,timer,offset=0,started=0,requested=false,generation=0,disposed=false;
  const abort=new AbortController();
  const duration=()=>buffer?(Number.isFinite(loopDuration)&&loopDuration>0&&Math.abs(loopDuration-buffer.duration)<.1?Math.min(loopDuration,buffer.duration):buffer.duration):0;
  const position=()=>duration()?(offset+(source?context.currentTime-started:0))%duration():0;
  const progress=()=>onProgress({current:position(),duration:duration()});
  function tick(){progress();if(source)timer=setTimer(tick,250);}
  function halt(){if(timer)clearTimer(timer);timer=null;if(source){offset=position();source.onended=null;source.stop();source.disconnect();source=null;}}
  function start(){source=context.createBufferSource();source.buffer=buffer;source.loop=loop;source.onended=()=>{if(loop)return;halt();offset=0;requested=false;onState('stopped');onEnded();};source.loopStart=0;source.loopEnd=duration();source.connect(gain);started=context.currentTime;source.start(0,offset%duration());tick();}
  async function load(){
    for(const url of [...new Set([sources.ogg,sources.mp3].filter(Boolean))]){
      try{const response=await fetcher(url,{signal:abort.signal});if(!response.ok)throw Error('Music request failed');const decoded=await context.decodeAudioData(await response.arrayBuffer());if(disposed)throw Error('Disposed');if(!decoded.duration)throw Error('Empty audio');buffer=decoded;return;}
      catch(error){if(disposed||abort.signal.aborted)throw error;}
    }
    throw Error('Music could not be decoded');
  }
  function stop(){fallback?.stop();requested=false;generation++;halt();progress();context?.suspend().catch(()=>{});if(!disposed)onState('stopped');}
  return {
    async toggle(){
      if(disposed)return;if(fallback)return fallback.toggle();if(requested){stop();return;}requested=true;const version=++generation;onState('loading');
      try{
        if(!context){context=createContext();gain=context.createGain();gain.gain.value=volume;gain.connect(context.destination);}
        const resume=context.resume();if(!buffer&&!loading)loading=load().catch(error=>{loading=null;throw error;});
        await Promise.all([resume,loading]);if(disposed||version!==generation||!requested)return;
        start();onState('playing');
      }catch{if(disposed||version!==generation)return;requested=false;halt();context?.suspend().catch(()=>{});if(createFallback){fallback=createFallback();await fallback.toggle();}else onState('error');}
    },
    stop,
    seek(value){if(fallback)return fallback.seek(value);if(!buffer||!Number.isFinite(value))return;const running=!!source;halt();offset=Math.max(0,Math.min(duration(),value))%duration();if(running)start();else progress();},
    dispose(){if(disposed)return;stop();disposed=true;fallback?.dispose?.();abort.abort();buffer=null;loading=null;gain?.disconnect();context?.close().catch(()=>{});},
  };
}

function createElementMusic({sources, onState, onProgress=()=>{}, volume = .2, loop=true, onEnded=()=>{}, createAudio = () => new Audio()}) {
  let audio, requested = false, generation = 0;
  const progress=()=>onProgress({current:audio?.currentTime||0,duration:Number.isFinite(audio?.duration)?audio.duration:0});
  function stop() {
    requested = false; generation++;
    audio?.pause(); onState('stopped');
  }
  return {
    async toggle() {
      if(requested) { stop(); return; }
      requested = true;
      const current = ++generation;
      onState('loading');
      try {
        if(!audio) {
          audio=createAudio();audio.preload='none';audio.loop=loop;audio.volume=volume;
          audio.src=sources.ogg&&audio.canPlayType('audio/ogg; codecs="opus"')?sources.ogg:sources.mp3||sources.ogg;
          audio.addEventListener('ended',()=>{if(!loop){stop();onEnded();}});
          for(const event of ['timeupdate','loadedmetadata','durationchange','seeked'])audio.addEventListener(event,progress);
          audio.addEventListener('error',()=>{
            if(requested) { requested=false;generation++;audio.pause();onState('error'); }
          });
        }
        if(audio.error)audio.load();
        await audio.play();
        if(current!==generation){if(!requested)audio.pause();return;}
        onState('playing');
      } catch {
        if(current!==generation)return;
        requested=false;onState('error');
      }
    },
    stop,
    dispose(){stop();if(audio){audio.removeAttribute?.('src');audio.load?.();audio=null;}},
    seek(value) {if(audio&&Number.isFinite(audio.duration)&&audio.duration>0&&Number.isFinite(value)){audio.currentTime=Math.max(0,Math.min(audio.duration,value));progress();}},
  };
}

export const musicTime=seconds=>{const n=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
