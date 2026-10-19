import {readFile} from 'node:fs/promises';
import {villageWorld} from '../../src/scripts/village-world.mjs';
const catalog=JSON.parse(await readFile(new URL('../../content/catalog.json',import.meta.url),'utf8'));
// Keep dense-layout regression cases independent of the current editable map.
delete catalog.world;
for(const worker of catalog.workers)if(!['induo-works','frondward'].includes(worker.id))delete worker.house;
catalog.workers.find(w=>w.id==='induo-works').house={x:3,y:3};
catalog.workers.find(w=>w.id==='frondward').house={x:13,y:3};
catalog.world=villageWorld(catalog);
export default catalog;
