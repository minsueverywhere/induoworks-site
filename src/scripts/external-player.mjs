import {externalWork} from '../external-work.mjs';

export function mountExternal(container,value,title,{defer=true,lang='ko'}={}){
  const source=externalWork(value),ko=lang==='ko';
  const clear=()=>{container.querySelectorAll('audio').forEach(audio=>{audio.pause();audio.removeAttribute('src');audio.load();});container.replaceChildren();};
  clear();
  const open=()=>{
    clear();
    const media=document.createElement(source.kind==='embed'?'iframe':source.kind==='image'?'img':'audio');
    media.style.cssText='display:block;width:100%;max-width:100%;border:0';
    if(source.kind==='embed'){
      media.title=title+' · '+source.provider;media.height=source.provider==='YouTube'?'220':'166';media.style.minWidth='200px';
      media.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';media.referrerPolicy='strict-origin-when-cross-origin';media.allowFullscreen=true;
    }else if(source.kind==='image'){media.alt=title;media.style.height='auto';media.decoding='async';}
    else{media.controls=true;media.preload='none';}
    media.src=source.src;container.append(media);
    const link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=(ko?'원본에서 열기':'Open original')+' · '+source.provider+' ↗';container.append(link);
  };
  if(defer){const button=document.createElement('button');button.type='button';button.textContent=(ko?'열기':'Open')+' · '+source.provider;button.addEventListener('click',open);container.append(button);}else open();
  return clear;
}
