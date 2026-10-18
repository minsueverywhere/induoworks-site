import {validateCatalog} from '../content-schema.mjs';
import {villageWorld} from '../scripts/village-world.mjs';
import {placementObjects,objectPlacementError} from '../../scripts/editor-placement.mjs';
export const villageSlice=catalog=>({world:structuredClone(villageWorld(catalog)),houses:catalog.workers.filter(w=>w.house).map(w=>({id:w.id,house:structuredClone(w.house)}))});
export function mergeVillage(catalog,layout){
  if(!layout||Object.keys(layout).some(k=>!['world','houses'].includes(k))||!Array.isArray(layout.houses))throw Error('마을 배치를 확인해 주세요.');
  const expected=catalog.workers.filter(w=>w.house).map(w=>w.id);
  if(layout.houses.length!==expected.length||new Set(layout.houses.map(w=>w.id)).size!==expected.length||layout.houses.some(w=>!expected.includes(w.id)||Object.keys(w).some(k=>!['id','house'].includes(k))))throw Error('기존 집의 배치만 변경할 수 있습니다.');
  const next=structuredClone(catalog);next.world=structuredClone(layout.world);
  for(const row of layout.houses)next.workers.find(w=>w.id===row.id).house=structuredClone(row.house);
  validateCatalog(next);
  for(const o of placementObjects(next)){const error=objectPlacementError(next,o.type,o.id,o.point);if(error)throw Error(o.id+' · '+error);}
  return next;
}
