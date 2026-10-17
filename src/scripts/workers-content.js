import { loadContent } from './content-loader.mjs';
import { renderWorkers } from './content-render.mjs';
const root=document.getElementById('workers-content');
const content=await loadContent();
if(content) {
  renderWorkers(root,content,root.dataset.lang,JSON.parse(root.dataset.labels));
  if(location.hash)document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}
root.dataset.contentSource=content?'remote':'embedded';
