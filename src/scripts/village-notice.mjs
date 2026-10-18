export function createSceneNotice(element,ko=true){
  let timer,until=0,messageUntil=0,message='';
  const normalTop=Number.parseFloat(globalThis.getComputedStyle?.(element).top)||24;
  const paint=()=>{
    if(timer)clearTimeout(timer);
    const seconds=Math.max(0,Math.ceil((until-Date.now())/1000)),copy=Date.now()<messageUntil?message:'';
    const wait=seconds?(ko?'다음 작성까지 '+seconds+'초':'Write again in '+seconds+'s'):'';
    element.textContent=[copy,wait].filter(Boolean).join(' · ');element.hidden=!element.textContent;element.setAttribute('aria-live',seconds?'off':'polite');
    const rect=element.parentElement?.getBoundingClientRect();if(rect)element.style.top=Math.max(normalTop,(globalThis.visualViewport?.offsetTop||0)-rect.top+12)+'px';
    if(seconds||copy)timer=setTimeout(paint,1000);
  };
  return {message(text){message=text;messageUntil=Date.now()+5000;paint();},cooldown(seconds){until=Date.now()+seconds*1000;paint();},dispose(){if(timer)clearTimeout(timer);element.textContent='';element.hidden=true;}};
}
