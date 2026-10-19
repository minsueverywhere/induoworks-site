import {onPage} from './page-lifecycle.mjs';
import {loadContent} from './content-loader.mjs';
import {soundtracks,musicArtist} from './village-tracks.mjs';
import {resolveMedia,CONTENT_ORIGIN} from '../content-schema.mjs';
import {createMusicSession,siteMusic,sameMusic} from './site-music.mjs';
import {musicTime} from './village-music.mjs';
import {elements} from './content-render.mjs';
onPage('soundtrack',async(root,life)=>{
  const ko=root.dataset.lang==='ko',lang=root.dataset.lang,el=elements(root);
  const catalog=await loadContent()||resolveMedia(JSON.parse(root.dataset.catalog),CONTENT_ORIGIN);
  if(!life.alive())return;
  const group=soundtracks(catalog).find(g=>g.id===new URLSearchParams(location.search).get('id'));
  if(!group){document.getElementById('soundtrack-description').textContent=ko?'사운드트랙을 찾을 수 없습니다.':'Soundtrack not found.';return;}
  document.title=group.title+' Soundtrack | Induo Works';
  document.getElementById('soundtrack-title').textContent=group.title+' Soundtrack';
  const project=catalog.projects.find(p=>p.title.en.toLowerCase()===group.title.toLowerCase());
  document.getElementById('soundtrack-description').textContent=project?.summary[lang]||(ko?'이 작품의 음악을 모았습니다. 곡을 골라 들어보세요.':'Music from this work. Choose a track to listen.');
  document.getElementById('soundtrack-credit').replaceChildren(...catalog.workers.filter(w=>group.workerIds.includes(w.id)).map(w=>el('a',{href:(ko?'/ko':'')+'/workers/#'+w.id},w.name)),...(project?[el('a',{href:(ko?'/ko':'')+'/work/detail/?id='+encodeURIComponent(project.slug)},ko?'작품 소개':'About the project')]:[]));
  let current=-1;
  const player=createMusicSession(undefined,{loop:false,onEnded:()=>{if(document.getElementById('soundtrack-sequence').checked&&current+1<group.tracks.length)void play(current+1);}});
  async function play(index){siteMusic.pause();current=index;await player.toggle(group.tracks[index]);}
  const controls=group.tracks.map((track,index)=>{
    const button=el('button',{type:'button','aria-label':ko?'재생':'Play'}),svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.append(path);button.append(svg);
    button.addEventListener('click',()=>void play(index));
    const seek=el('input',{type:'range',min:0,max:track.duration||0,step:.1,value:0,'aria-label':track.title+(ko?' 재생 위치':' playback position'),disabled:''}),time=el('span',{},'0:00 / '+musicTime(track.duration));
    seek.addEventListener('input',()=>player.seek(Number(seek.value)));
    // Hands the track to the site-wide floating player, which keeps playing across pages.
    const floatLabel=ko?'플로팅 플레이어로 듣기':'Play in floating player',floating=el('button',{type:'button',class:'soundtrack-float','aria-label':floatLabel,title:floatLabel}),floatSvg=document.createElementNS('http://www.w3.org/2000/svg','svg'),floatPath=document.createElementNS('http://www.w3.org/2000/svg','path');
    floatSvg.setAttribute('viewBox','0 0 24 24');floatSvg.setAttribute('aria-hidden','true');floatPath.setAttribute('d','M3 5h18v14H3ZM12 12h7v5h-7Z');floatSvg.append(floatPath);floating.append(floatSvg);
    floating.addEventListener('click',()=>{player.pause();const state=siteMusic.snapshot();if(!(sameMusic(state.track,track)&&state.state==='playing'))void siteMusic.toggle(track);});
    const description=typeof track.description==='string'?track.description:track.description?.[lang];
    const row=el('section',{class:'soundtrack-track',id:'track-'+track.id},el('h2',{},String(index+1).padStart(2,'0')+' · '+track.title),el('p',{},musicArtist(track)),...(description?[el('p',{},description)]:[]),el('div',{class:'soundtrack-controls'},button,seek,time,floating));
    return {row,track,button,path,seek,time};
  });
  document.getElementById('soundtrack-tracks').replaceChildren(...controls.map(c=>c.row));
  life.cleanup(player.subscribe(state=>{
    for(const c of controls){const selected=sameMusic(c.track,state.track),playing=selected&&state.state==='playing';c.path.setAttribute('d',playing?'M8 5v14M16 5v14':'m8 5 11 7-11 7Z');c.button.setAttribute('aria-label',playing?(ko?'일시정지':'Pause'):(ko?'재생':'Play'));c.button.setAttribute('aria-pressed',String(playing));c.seek.disabled=!selected||['loading','error'].includes(state.state);if(selected){c.seek.max=state.duration;c.seek.value=state.current;c.time.textContent=musicTime(state.current)+' / '+musicTime(state.duration);}}
    document.getElementById('soundtrack-notice').textContent=state.state==='loading'?(ko?'곡을 불러오는 중입니다. 준비되면 모든 구간으로 이동할 수 있습니다.':'Loading this track. All positions will be available once ready.'):state.state==='error'?(ko?'음악을 불러오지 못했습니다. 다시 시도해 주세요.':'Could not load music. Please try again.'):'';
  }));
  life.cleanup(siteMusic.subscribe(state=>{if(state.state==='playing'||state.state==='loading')player.pause();}));
  life.cleanup(()=>player.close());
  const target=controls.find(c=>'#'+c.row.id===location.hash);target?.row.scrollIntoView({block:'nearest'});
});
