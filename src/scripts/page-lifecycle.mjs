export function onPage(id,setup){
  let current,dispose;
  async function start(){
    const root=document.getElementById(id);if(!root||root===current)return;
    dispose?.();current=root;
    const controller=new AbortController(),cleanups=[];
    const life={signal:controller.signal,alive:()=>root.isConnected&&!controller.signal.aborted,
      on(target,type,fn,options={}){target.addEventListener(type,fn,{...options,signal:controller.signal});},
      cleanup(fn){cleanups.push(fn);},
      observe(target,fn){const observer=new ResizeObserver(fn);observer.observe(target);cleanups.push(()=>observer.disconnect());},
    };
    dispose=()=>{controller.abort();for(const fn of cleanups)fn();};
    try{await setup(root,life);}catch(error){if(life.alive())console.error('Page initialization failed',error);}
  }
  document.addEventListener('astro:before-swap',()=>{dispose?.();dispose=null;current=null;});
  document.addEventListener('astro:page-load',start);
  void start();
}
