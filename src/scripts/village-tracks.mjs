export function villageTrack(catalog,workerId) {
  const id=catalog.workers?.find(w=>w.id===workerId)?.musicId||catalog.musicId;
  return catalog.tracks?.find(track=>track.id===id)||catalog.music;
}

export const musicArtist=track=>track.artist||track.project;
export const musicWorkPath=(track,lang)=>(lang==='ko'?'/ko':'')+'/work/?kind=music&q='+encodeURIComponent(track.title)+'#work-info-music:'+(track.id||'legacy');
export const musicTracks=catalog=>[{...catalog.music,id:'legacy'},...(catalog.tracks||[])];

export const musicSummary=track=>[...new Set([track.artist,track.project].filter(Boolean))].join(' · ');
