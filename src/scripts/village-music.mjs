export function createVillageMusic({sources, onState, volume = .2, createAudio = () => new Audio()}) {
  let audio, requested = false, generation = 0;
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
          audio.src=audio.canPlayType('audio/ogg; codecs="opus"')?sources.ogg:sources.mp3;
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
    setVolume(value) { volume=Math.max(0,Math.min(1,value));if(audio)audio.volume=volume; },
  };
}
