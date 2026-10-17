export function bindZoomSlider(input,onChange,onActive,signal){
  let pointer;
  const listen=(type,fn)=>input.addEventListener(type,fn,signal?{signal}:undefined);
  const update=event=>{const r=input.getBoundingClientRect(),fraction=Math.max(0,Math.min(1,(event.clientX-r.left-8)/(r.width-16)));onChange(Number(input.min)+fraction*(Number(input.max)-Number(input.min)),true);};
  listen('pointerdown',event=>{if(event.button!==0||event.isPrimary===false)return;event.preventDefault();event.stopPropagation();pointer=event.pointerId;input.setPointerCapture(pointer);onActive(true);update(event);});
  listen('pointermove',event=>{if(pointer!==event.pointerId)return;event.preventDefault();update(event);});
  const end=event=>{if(pointer!==event.pointerId)return;pointer=undefined;onActive(false);};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(type,end);
  listen('input',()=>{if(pointer===undefined)onChange(Number(input.value),false);});
}
