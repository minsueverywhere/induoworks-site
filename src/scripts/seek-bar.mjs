// Makes a title strip seek the shared music session: press or drag to choose a position,
// arrows/Home/End from the keyboard. `holder` gets data-seeking while a pointer is down.
export function bindSeekBar(track,holder,music,options={}){
  let seeking=null;
  const on=(type,fn)=>track.addEventListener(type,fn,options);
  const seekAt=event=>{const {duration}=music.snapshot();if(!duration)return;const r=track.getBoundingClientRect();music.seek(Math.max(0,Math.min(1,(event.clientX-r.left)/r.width))*duration);};
  on('pointerdown',event=>{if(event.button!==0)return;seeking=event.pointerId;holder.dataset.seeking='';seekAt(event);try{track.setPointerCapture(event.pointerId);}catch{/* Seeking still follows moves over the bar. */}});
  on('pointermove',event=>{if(seeking===event.pointerId)seekAt(event);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])on(type,()=>{seeking=null;delete holder.dataset.seeking;});
  on('keydown',event=>{
    const {current,duration}=music.snapshot(),next={ArrowLeft:current-5,ArrowRight:current+5,Home:0,End:duration-1}[event.key];
    if(next===undefined||!duration)return;event.preventDefault();music.seek(Math.max(0,Math.min(duration,next)));
  });
}
