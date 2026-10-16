export function normalize(text) { return String(text||'').normalize('NFKC').toLocaleLowerCase().trim(); }
export function matchesWork(entry, filters) {
  const words=normalize(filters.q).split(/\s+/).filter(Boolean);
  return words.every(word=>normalize(entry.search).includes(word)) &&
    (!filters.worker||entry.workerIds.includes(filters.worker)) &&
    (!filters.kind||entry.kind===filters.kind) &&
    (!filters.status||entry.status===filters.status) &&
    (!filters.tag||entry.tags.includes(filters.tag));
}
