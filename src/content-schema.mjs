export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 20000;
export const CONTENT_ORIGIN = 'https://induoworks-content.rlaalstn0910.workers.dev';

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const check = (condition, message) => { if (!condition) throw new Error(message); };
const text = value => typeof value === 'string' && value.length <= 20000;
const localized = value => value && text(value.en) && text(value.ko);
const ids = values => Array.isArray(values) && values.every(v => typeof v === 'string' && idPattern.test(v));
export function safeUrl(value) {
  if (typeof value !== 'string' || /[\s\\\x00-\x1f"<>]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value)) return !value.split('/').some(part=>part==='..' || part==='.');
  if (!/^https:\/\//.test(value)) return false;
  try { const url=new URL(value);return !url.username && !url.password; }
  catch { return false; }
}
export function validateCatalog(data) {
  check(data?.version === 1, 'Unsupported content version');
  check(JSON.stringify(data).length <= 1024*1024, 'Content catalog exceeds 1 MiB');
  for (const [key, id] of [['workers','id'],['projects','slug'],['media','id'],['notices','id']]) {
    check(Array.isArray(data[key]) && data[key].length <= 1000, 'Invalid '+key);
    const values = data[key].map(v => v?.[id]);
    check(ids(values) && new Set(values).size === values.length, 'Invalid or duplicate '+key+' IDs');
  }
  const owners = new Set(data.workers.map(w=>w.id));
  const tracks=data.tracks||[];
  check(Array.isArray(tracks) && tracks.length<=1000 && ids(tracks.map(t=>t.id)) && new Set(tracks.map(t=>t.id)).size===tracks.length && tracks.every(t=>t.id!=='legacy'), 'Invalid music IDs');
  if(data.musicId)check(tracks.some(t=>t.id===data.musicId),'Unknown default music');
  for (const worker of data.workers) {
    check(text(worker.name) && localized(worker.description), 'Invalid worker');
    if (worker.house) check(['x','y'].every(k=>Number.isInteger(worker.house[k]) && worker.house[k]>=0 && worker.house[k]<24), 'House outside village');
    if (worker.href) check(safeUrl(worker.href), 'Unsafe worker URL');
    if (worker.logoMediaId) check(data.media.some(m=>m.id===worker.logoMediaId), 'Unknown logo');
    if(worker.musicId)check(tracks.some(t=>t.id===worker.musicId),'Unknown workshop music');
  }
  check(data.workers.some(w=>w.id==='induo-works' && w.house), 'The tutorial needs the Induo Works house');
  for (const item of [...data.projects,...data.media]) {
    check(localized(item.title) && ids(item.workerIds || []) && (item.workerIds || []).every(id=>owners.has(id)), 'Invalid work owner or title');
    check(Array.isArray(item.tags || []) && (item.tags || []).every(text), 'Invalid tags');
  }
  for (const p of data.projects) {
    check(p.slug!=='detail', 'Reserved project slug');
    check(['site','game','music','artwork','experiment'].includes(p.kind) && ['shipped','in-progress','paused'].includes(p.status), 'Invalid work category');
    check(['summary','role','challenge','approach','outcome'].every(k=>localized(p[k])) && text(p.year) && Array.isArray(p.stack) && p.stack.every(text), 'Invalid project copy');
    for (const key of ['href','repo','steamUrl']) if (p[key]) check(safeUrl(p[key]), 'Unsafe project URL');
    if (p.thumbnail) check(safeUrl(p.thumbnail.src) && localized(p.thumbnail.alt) && localized(p.thumbnail.caption) && p.thumbnail.width>0 && p.thumbnail.height>0, 'Invalid thumbnail');
    check(!p.cover && !p.gallery, 'Use web thumbnails and media entries for runtime artwork');
  }
  for (const m of data.media) check(ids(m.workerIds) && Array.isArray(m.tags) && ['badge','preview','original'].every(k=>safeUrl(m[k])) && m.width>0 && m.height>0 && m.bytes>0 && m.bytes<=MAX_FILE_BYTES, 'Invalid artwork');
  for (const n of data.notices) check(localized(n.title) && localized(n.body) && (!n.href || safeUrl(n.href)) && (!n.linkLabel || localized(n.linkLabel)), 'Invalid notice');
  for(const track of [data.music,...tracks]) {
    check(text(track?.title) && text(track.project) && Number.isFinite(track.duration) && track.duration>0 && text(track.sourceSha256), 'Invalid music');
    check(ids(track.workerIds||[]) && (track.workerIds||[]).every(id=>owners.has(id)), 'Invalid music owner');
    for(const ext of ['ogg','mp3'])check(safeUrl(track.sources?.[ext]) && new URL(track.sources[ext],CONTENT_ORIGIN).pathname.endsWith('.'+ext),'Use Ogg and MP3 music');
  }
  return data;
}

export function mediaPaths(data) {
  return [...new Set([
    ...data.projects.flatMap(p=>p.thumbnail ? [p.thumbnail.src] : []),
    ...data.media.flatMap(m=>[m.badge,m.preview,m.original]),
    ...Object.values(data.music.sources),
    ...(data.tracks||[]).flatMap(t=>Object.values(t.sources)),
  ])];
}

export function resolveMedia(data, origin) {
  const result = JSON.parse(JSON.stringify(data));
  const url = path => new URL(path, origin).href;
  for (const p of result.projects) if (p.thumbnail) p.thumbnail.src=url(p.thumbnail.src);
  for (const m of result.media) for (const key of ['badge','preview','original']) m[key]=url(m[key]);
  for(const track of [result.music,...(result.tracks||[])])for(const ext of ['ogg','mp3'])track.sources[ext]=url(track.sources[ext]);
  return result;
}
