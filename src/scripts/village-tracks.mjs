export function villageTrack(catalog,workerId) {
  const id=catalog.workers?.find(w=>w.id===workerId)?.musicId||catalog.musicId;
  return catalog.tracks?.find(track=>track.id===id)||catalog.music;
}
