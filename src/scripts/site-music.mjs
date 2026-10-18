import {createVillageMusic} from './village-music.mjs';

export const sameMusic=(a,b)=>Boolean(a&&b&&JSON.stringify(a.sources)===JSON.stringify(b.sources));
export function createMusicSession(createPlayer=createVillageMusic){
  let track=null,player,state='stopped',current=0,duration=0,visible=false,generation=0;
  const listeners=new Set(),snapshot=()=>({track,state,current,duration,visible});
  const publish=()=>{for(const listener of listeners)listener(snapshot());};
  return {
    snapshot,
    subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);},
    async toggle(next=track){
      if(!next)return;
      if(!sameMusic(next,track)){
        generation++;if(player?.dispose)player.dispose();else player?.stop();track=next;current=0;duration=next.duration||0;state='stopped';
        const version=generation;
        player=createPlayer({sources:next.sources,loopDuration:next.duration,onState:value=>{if(version===generation){state=value;publish();}},onProgress:value=>{if(version===generation){current=value.current;duration=value.duration||track.duration||0;publish();}}});
      }else track=next;
      visible=true;publish();await player.toggle();
    },
    pause(){player?.stop();},
    seek(value){player?.seek(value);},
    close(){generation++;if(player?.dispose)player.dispose();else player?.stop();player=null;track=null;state='stopped';current=duration=0;visible=false;publish();},
  };
}
export const siteMusic=createMusicSession();
