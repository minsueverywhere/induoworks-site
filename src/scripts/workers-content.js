import { loadContent } from './content-loader.mjs';
import { renderWorkers } from './content-render.mjs';
import {onPage} from './page-lifecycle.mjs';
onPage('workers-content',async(root,life)=>{

const content=await loadContent();
if(!life.alive())return;
if(content) {
  renderWorkers(root,content,root.dataset.lang,JSON.parse(root.dataset.labels));
  if(location.hash)document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}
root.dataset.contentSource=content?'remote':'embedded';
});
