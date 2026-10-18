export function createSceneView(scene,button,viewport=globalThis.visualViewport){
  let outside=[],expanded=false;
  const fit=()=>{if(!expanded||!viewport)return;for(const [key,value]of Object.entries({left:viewport.offsetLeft,top:viewport.offsetTop,width:viewport.width,height:viewport.height}))scene.style.setProperty('--scene-view-'+key,value+'px');};
  viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);
  const set=value=>{
    expanded=value;
    scene.classList.toggle('studio-fullscreen',expanded);
    document.documentElement.classList.toggle('studio-open',expanded);
    button.setAttribute('aria-pressed',String(expanded));
    if(expanded){for(let el=scene;el.parentElement;el=el.parentElement)for(const sibling of el.parentElement.children)if(sibling!==el&&sibling.id!=='site-music'){outside.push([sibling,sibling.inert]);sibling.inert=true;}}
    else{for(const [el,inert] of outside)el.inert=inert;outside=[];for(const key of ['left','top','width','height'])scene.style.removeProperty('--scene-view-'+key);}
    fit();
  };
  const close=()=>{if(expanded)set(false);};
  return {dispose(){close();viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);},toggle(){set(button.getAttribute('aria-pressed')!=='true');},close};
}
