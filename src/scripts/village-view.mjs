export function createSceneView(scene,button){
  let outside=[];
  const set=expanded=>{
    scene.classList.toggle('studio-fullscreen',expanded);
    document.documentElement.classList.toggle('studio-open',expanded);
    button.setAttribute('aria-pressed',String(expanded));
    if(expanded){for(let el=scene;el.parentElement;el=el.parentElement)for(const sibling of el.parentElement.children)if(sibling!==el&&sibling.id!=='site-music'){outside.push([sibling,sibling.inert]);sibling.inert=true;}}
    else{for(const [el,inert] of outside)el.inert=inert;outside=[];}
  };
  return {toggle(){set(button.getAttribute('aria-pressed')!=='true');},close(){if(button.getAttribute('aria-pressed')==='true')set(false);}};
}
