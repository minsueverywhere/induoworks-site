import {validateCatalog,mediaPaths} from '../content-schema.mjs';
import {roomFloors} from '../scripts/village-room.mjs';
import {objectPlacementError,roomCatalog} from '../../scripts/editor-placement.mjs';
import {villageContent} from '../scripts/village-content.mjs';
const own=(item,owner)=>item.workerIds?.length===1&&item.workerIds[0]===owner;
export function studioSlice(catalog,owner){
  const worker=catalog.workers.find(w=>w.id===owner);if(!worker?.house)throw new Error('마을에 작업실이 있는 업체를 선택해 주세요.');
  return {room:structuredClone(worker.room||{floors:roomFloors(worker)}),projects:catalog.projects.filter(p=>own(p,owner)),media:catalog.media.filter(m=>own(m,owner)),tracks:(catalog.tracks||[]).filter(t=>own(t,owner))};
}
export function mergeStudio(catalog,owner,proposal){
  if(!proposal||Object.keys(proposal).some(key=>!['room','projects','media','tracks'].includes(key)))throw new Error('집 내부와 자기 작품만 변경할 수 있습니다.');
  const result=structuredClone(catalog),worker=result.workers.find(w=>w.id===owner);
  if(!worker?.house)throw new Error('작업실이 없습니다.');
  worker.room=proposal.room;
  for(const [kind,key] of [['projects','slug'],['media','id'],['tracks','id']]){
    const items=proposal[kind];if(!Array.isArray(items))throw new Error('작품 목록이 올바르지 않습니다.');
    const others=(result[kind]||[]).filter(item=>!own(item,owner));
    if(items.some(item=>!own(item,owner)||others.some(other=>other[key]===item[key])))throw new Error('다른 제작자의 작품이나 소속은 수정할 수 없습니다.');
    result[kind]=[...others,...structuredClone(items)];
  }
  validateCatalog(result);
  if([...proposal.projects,...proposal.media].some(item=>!item.title.ko.trim()||!item.title.en.trim())||proposal.tracks.some(item=>!item.title.trim()||!item.project.trim()))throw new Error('한국어·영어 제목과 음악의 관련 작품을 입력해 주세요.');
  const files=new Set(mediaPaths(catalog));
  if(mediaPaths(result).some(path=>!files.has(path)))throw new Error('새 파일은 호스트가 먼저 등록해야 합니다. 등록된 파일을 선택해 주세요.');
  if(result.projects.filter(p=>p.workerIds.includes(owner)).length>9||result.media.filter(m=>m.workerIds.includes(owner)).length>4)throw new Error('현재 자동 전시는 작품 9개·이미지 4개까지 지원합니다.');
  const allowed=(kind,ref)=>kind==='music'&&ref==='legacy'||(kind==='project'?result.projects:kind==='media'?result.media:result.tracks).some(item=>(item.slug||item.id)===ref&&item.workerIds.includes(owner));
  for(const [level,floor] of worker.room.floors.entries()){
    const space=roomCatalog(result,owner,level);
    for(const item of floor.exhibits){if(!allowed(item.kind,item.ref))throw new Error('자기 작품과 공용 기본 음악만 전시할 수 있습니다.');const error=objectPlacementError(space,'exhibit',item.id,item);if(error)throw new Error(error);}
    for(const item of villageContent(result,'ko','').places.filter(p=>p.area==='room'&&p.owner===owner&&(p.floor||0)===level))if(!floor.tiles.some(t=>t.x===Math.round(item.x)&&t.y===Math.round(item.y)))throw new Error('전시물 아래 바닥을 남겨주세요.');
  }
  return result;
}
