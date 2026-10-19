export function villageTrack(catalog,workerId) {
  const id=catalog.workers?.find(w=>w.id===workerId)?.musicId||catalog.musicId;
  return catalog.tracks?.find(track=>track.id===id)||catalog.music;
}

export const musicArtist=track=>track.artist||track.project;
export const soundtrackId=track=>JSON.stringify([track.project||'Music',[...(track.workerIds||[])].sort()]);
export const musicWorkPath=(track,lang)=>(lang==='ko'?'/ko':'')+'/work/soundtrack/?id='+encodeURIComponent(soundtrackId(track))+'#track-'+(track.id||'legacy');
export const musicTracks=catalog=>[{...catalog.music,id:'legacy'},...(catalog.tracks||[])];

export function soundtracks(catalog){
  const groups=new Map();
  for(const track of musicTracks(catalog)){
    const id=soundtrackId(track);
    if(!groups.has(id))groups.set(id,{id,title:track.project||'Music',workerIds:track.workerIds||[],tracks:[]});
    groups.get(id).tracks.push(track);
  }
  return [...groups.values()];
}

export function soundtrackChoices(catalog,choices){
  return soundtracks(catalog).map(group=>({...group,choices:choices.filter(([id])=>group.tracks.some(t=>id===t.id||id==='music:'+t.id))})).filter(group=>group.choices.length);
}

export function soundtrackWorks(catalog,lang){
  return soundtracks(catalog).map(group=>({id:'soundtrack:'+group.id,title:group.title+' Soundtrack',summary:(lang==='ko'?group.tracks.length+'곡 · ':group.tracks.length+' tracks · ')+group.tracks.map(t=>t.title).join(', '),kind:'music',workerIds:group.workerIds,tags:['Music','Soundtrack'],status:'shipped',year:'',href:musicWorkPath(group.tracks[0],lang).split('#')[0],image:'',imageWidth:600,imageHeight:400,imageAlt:group.title,imageCaption:'',file:false}));
}

export const musicSummary=track=>[...new Set([track.artist,track.project].filter(Boolean))].join(' · ');
