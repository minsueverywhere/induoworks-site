export function createVillageMusic({sources, onState, onProgress=()=>{}, volume = .2, createAudio = () => new Audio()}) {
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
          audio=createAudio();audio.preload='none';audio.loop=true;audio.volume=volume;
          audio.src=sources.ogg&&audio.canPlayType('audio/ogg; codecs="opus"')?sources.ogg:sources.mp3||sources.ogg;
          for(const event of ['timeupdate','loadedmetadata','durationchange','seeked'])audio.addEventListener(event,progress);
          audio.addEventListener('error',()=>{
            if(requested) { requested=false;generation++;audio.pause();onState('error'); }
          });
        }
        if(audio.error)audio.load();
        await audio.play();
        if(current!==generation)return;
        onState('playing');
      } catch {
        if(current!==generation)return;
        requested=false;onState('error');
      }
    },
    stop,
    seek(value) {if(audio&&Number.isFinite(audio.duration)&&audio.duration>0&&Number.isFinite(value)){audio.currentTime=Math.max(0,Math.min(audio.duration,value));progress();}},
  };
}

export const musicTime=seconds=>{const n=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
