export function mountGuestbook(container,owner,{visit,notice,board='main'}={}){
  const ko=document.documentElement.lang.startsWith('ko'),life=new AbortController(),prefix=ko?'/ko':'';
  const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
  const arrow=()=>{const e=el('i');e.className='guestbook-chevron';e.setAttribute('aria-hidden','true');return e;};
  const icon=kind=>{
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
    path.setAttribute('d',{mail:'M3 5h18v14H3ZM3 6l9 7 9-7',dm:'M4 4h16v13H9l-5 4ZM8 9h8M8 13h5',home:'m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7',works:'M8 7V4h8v3M3 7h18v14H3ZM3 12l9 3 9-3M12 13v4',info:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 10v7M12 6v1',reply:'m9 5-6 6 6 6M3 11h11a7 7 0 0 1 7 7',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',corner:'M4 3v14h16',close:'m6 6 12 12M6 18 18 6'}[kind]);
    svg.append(path);return svg;
  };
  const box=el('div');box.className='village-guestbook';container.append(box);
  const status=el('p',ko?'불러오는 중…':'Loading…');box.append(status);
  const confirmation=el('dialog');confirmation.className='guestbook-confirm';confirmation.setAttribute('aria-label',ko?'방명록 삭제 확인':'Confirm deletion');container.append(confirmation);
  let menus=[],pageBefore,pendingConfirmation,timer,cooldownUntil=0,noticeUntil=0,noticeMessage='',sendButton,posting=false;
  const paintNotice=()=>{
    if(timer)globalThis.clearTimeout?.(timer);const seconds=Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000));
    const text=Date.now()<noticeUntil?noticeMessage:seconds?(ko?'다음 작성까지 '+seconds+'초':'Write again in '+seconds+'s'):'';
    if(!notice)status.textContent=text;
    if(sendButton)sendButton.disabled=posting||seconds>0;
    if(seconds||Date.now()<noticeUntil)timer=globalThis.setTimeout?.(paintNotice,1000);
  };
  const inform=message=>{notice?.message(message);noticeMessage=message;noticeUntil=Date.now()+5000;paintNotice();};
  const finishConfirmation=value=>{confirmation.close();pendingConfirmation?.(value);pendingConfirmation=undefined;};
  confirmation.addEventListener('cancel',event=>{event.preventDefault();finishConfirmation(false);});
  confirmation.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
  const askDelete=()=>{
    if(pendingConfirmation)return Promise.resolve(false);
    return new Promise(resolve=>{
      pendingConfirmation=resolve;confirmation.replaceChildren(el('p',ko?'이 글을 삭제할까요?':'Delete this entry?'),el('p',ko?'삭제한 본문은 되돌릴 수 없습니다. 다른 사람의 답글은 유지됩니다.':'Deleted text cannot be restored. Other visitors’ replies are kept.'));
      const actions=el('div');for(const [label,value] of [[ko?'취소':'Cancel',false],[ko?'삭제':'Delete',true]]){const b=el('button',label);b.type='button';b.addEventListener('click',()=>finishConfirmation(value));actions.append(b);}confirmation.append(actions);confirmation.showModal();
    });
  };
  const action=(label,kind,fn)=>{const b=el('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.append(icon(kind));b.addEventListener('click',fn);return b;};
  function messageText(parent,message){
    let offset=0;for(const match of message.matchAll(/https?:\/\/[^\s<>"']+/g)){
      const raw=match[0],url=raw.replace(/[.,!?;:)\]}]+$/,'');parent.append(el('span',message.slice(offset,match.index)));
      const link=el('a',url);link.href=url;link.target='_blank';link.rel='noopener noreferrer nofollow';parent.append(link);offset=match.index+url.length;
    }parent.append(el('span',message.slice(offset)));
  }
  const timestamp=value=>{const d=new Date(value),pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes());};
  const closeMenus=()=>{for(const menu of menus)menu.open=false;};
  document.addEventListener?.('click',event=>{for(const menu of menus)if(!menu.contains(event.target))menu.open=false;},{signal:life.signal});
  document.addEventListener?.('keydown',event=>{if(event.key==='Escape'&&menus.some(m=>m.open)){event.stopPropagation();closeMenus();}},{signal:life.signal,capture:true});
  document.addEventListener?.('scroll',event=>{if(!menus.some(m=>m.contains(event.target)))closeMenus();},{signal:life.signal,capture:true});
  async function load(method='GET',body,before=pageBefore){
    if(method==='GET')pageBefore=before;
    const response=await fetch('/api/studio/guestbook?owner='+encodeURIComponent(owner)+'&board='+encodeURIComponent(board)+(before?'&before='+encodeURIComponent(before):''),{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:life.signal});
    const data=await response.json();if(Number.isInteger(data.retryAfter)){cooldownUntil=Date.now()+data.retryAfter*1000;notice?.cooldown(data.retryAfter);paintNotice();}if(!response.ok)throw Error(data.error);return data;
  }
  function contactLinks(nav,contact){
    if(contact?.email){const a=el('a');a.href='mailto:'+encodeURIComponent(contact.email);a.append(icon('mail'),el('span','Email'));nav.append(a);}
    if(contact?.discordUserId){const a=el('a');a.href='https://discord.com/users/'+encodeURIComponent(contact.discordUserId);a.title=ko?'Discord 프로필에서 메시지 보내기':'Message from Discord profile';a.target='_blank';a.rel='noopener noreferrer';a.append(icon('dm'),el('span','Discord DM'));nav.append(a);}
  }
  function authorMenu(parent,label,badgeClass,fill){
    const menu=el('details'),badge=el('summary',label),nav=el('nav');menu.className='guestbook-team-menu';badge.className=badgeClass;badge.title=label;badge.setAttribute('aria-label',label+(ko?' 메뉴':' menu'));fill(nav);
    menu.append(badge,nav);menus.push(menu);parent.append(menu);
    menu.addEventListener('toggle',()=>{
      if(!menu.open)return;for(const other of menus)if(other!==menu)other.open=false;
      const r=badge.getBoundingClientRect(),view=globalThis.visualViewport,left=view?.offsetLeft||0,top=view?.offsetTop||0,width=view?.width||innerWidth,height=view?.height||innerHeight;
      nav.style.maxHeight=Math.max(40,height-24)+'px';nav.style.left=Math.max(left+12,Math.min(r.left,left+width-nav.offsetWidth-12))+'px';nav.style.top=Math.max(top+12,Math.min(r.bottom+4,top+height-nav.offsetHeight-12))+'px';
    });
  }
  function author(parent,entry){
    if(entry.author_team_name){
      const team=entry.team;
      if(team)authorMenu(parent,entry.author_team_name,'guestbook-team',nav=>{
        const link=(kind,label,title,href)=>{const a=el('a');a.href=href;a.title=title;a.setAttribute('aria-label',title);a.append(icon(kind),el('span',label));nav.append(a);return a;};
        if(team.hasHouse){const a=link('home','Workshop',ko?'이 팀의 작업실 보기':'Visit this team’s workshop',prefix+'/?worker='+encodeURIComponent(team.id));if(visit)a.addEventListener('click',event=>{event.preventDefault();visit(team.id);});}
        link('works','Works',ko?'이 팀의 작업 보기':'View this team’s work',prefix+'/work/?worker='+encodeURIComponent(team.id));
        link('info','Worker',ko?'이 팀의 정보 보기':'View this team’s information',prefix+'/workers/#'+encodeURIComponent(team.id));
        contactLinks(nav,team.contact);
      });else{const badge=el('span',entry.author_team_name);badge.className='guestbook-team';parent.append(badge);}
    }
    if(entry.name)authorMenu(parent,entry.name,'guestbook-person',nav=>{
      contactLinks(nav,entry.contact);
      if(!entry.contact?.email&&!entry.contact?.discordUserId){const text=el('span',ko?'연락처 비공개':'Contact not shared');text.className='guestbook-contact-private';nav.append(text);}
    });
  }
  function show(data){
    menus=[];box.replaceChildren();
    const list=el('div');box.append(list);
    let form,input,replyInfo,cancel,replying=null;
    const replyTo=(entry,article)=>{
      replying=entry;replyInfo.hidden=false;cancel.hidden=false;
      article.append(form);input.setAttribute('aria-label',ko?'답글 내용':'Reply');form.scrollIntoView?.({block:'nearest'});input.focus();
    };
    const renderEntry=(entry,parent,isReply=false,allowReply=true)=>{
      const article=el('article'),meta=el('div'),name=el('div'),time=el('time',timestamp(entry.created)),actions=el('div');name.className='guestbook-author';meta.className='guestbook-entry-meta';actions.className='guestbook-entry-actions';article.className=isReply?'guestbook-reply':'guestbook-entry';
      author(name,entry);time.dateTime=new Date(entry.created).toISOString();meta.append(name,actions,time);
      if(!entry.deleted&&data.canWrite&&allowReply){const reply=action(ko?'답글':'Reply','reply',()=>replyTo(entry,isReply?parent:article));reply.className='guestbook-reply-action';actions.append(reply);}
      if(entry.canDelete){const remove=action(ko?'삭제':'Delete','trash',async()=>{remove.disabled=true;try{if(!await askDelete())return;show(await load('DELETE',{id:entry.id}));}catch(error){inform(error.message);}finally{remove.disabled=false;}});actions.append(remove);}
      const content=el('p');content.className='guestbook-message';
      if(entry.replyTo){const tag=el('strong','@'+(entry.replyTo.name||(ko?'삭제된 글':'Deleted entry'))+' ');tag.className='guestbook-mention';content.append(tag);}
      messageText(content,entry.deleted?(ko?'삭제된 글입니다.':'This entry was deleted.'):entry.message);article.append(meta,content);
      for(const reply of entry.replies||[])renderEntry(reply,article,true,allowReply&&!entry.deleted);
      parent.append(article);
    };
    for(const entry of data.entries)renderEntry(entry,list);
    if(!data.entries.length)list.append(el('p',ko?'첫 글을 남겨 주세요.':'Leave the first note.'));
    if(data.next){const more=el('button',ko?'이전 글':'Older entries');more.type='button';more.addEventListener('click',async()=>{more.disabled=true;try{show(await load('GET',undefined,data.next));}catch(error){inform(error.message);more.disabled=false;}});box.append(more);}
    if(data.canWrite){
      form=el('form');input=el('textarea');const send=el('button',ko?'남기기':'Sign');input.maxLength=300;input.required=true;input.rows=2;input.placeholder=ko?'의견을 남겨 주세요 (300자)':'Leave a note (300 characters)';input.setAttribute('aria-label',ko?'방명록 내용':'Guestbook message');send.type='submit';send.className='guestbook-send';sendButton=send;
      replyInfo=el('span');replyInfo.className='guestbook-reply-marker';replyInfo.hidden=true;replyInfo.append(icon('corner'));
      cancel=action(ko?'답글 취소':'Cancel reply','close',()=>{replying=null;replyInfo.hidden=true;cancel.hidden=true;box.append(form);input.setAttribute('aria-label',ko?'방명록 내용':'Guestbook message');});cancel.className='guestbook-reply-cancel';cancel.hidden=true;
      const identity=data.identity,teams=identity?.teams||[],select=el('select'),hide=el('input'),preview=el('div'),picker=el('span'),selectedLabel=el('span');
      select.setAttribute('aria-label',ko?'표시할 소속':'Team to display');select.className='guestbook-team-select';picker.className='guestbook-team guestbook-team-picker';picker.append(selectedLabel,arrow(),select);
      for(const team of [...teams,{id:'',name:ko?'소속 없음':'No team'}]){const option=el('option',team.name);option.value=team.id;select.append(option);}
      select.value=teams[0]?.id||'';hide.type='checkbox';
      const hideLabel=el('label',ko?'숨김':'Hide');hideLabel.title=ko?'이름 숨기기':'Hide my name';hide.setAttribute('aria-label',ko?'이름 숨기기':'Hide my name');hideLabel.append(hide);hideLabel.className='guestbook-hide';
      preview.className='guestbook-identity';preview.setAttribute('aria-live','polite');preview.setAttribute('aria-label',ko?'공개될 이름':'Public display name');
      const name=el('strong',identity?.name),nameGroup=el('span');nameGroup.className='guestbook-name-group';name.title=identity?.name||'';nameGroup.append(name);if(teams.length)nameGroup.append(hideLabel);
      const writer=el('div'),composerActions=el('div');writer.className='guestbook-writer';composerActions.className='guestbook-composer-actions';writer.append(replyInfo);if(teams.length)writer.append(picker);writer.append(nameGroup);composerActions.append(cancel,send);preview.append(writer,composerActions);
      const contacts=el('details'),contactTitle=el('summary',ko?'연락처 공개 · 선택':'Share contact · optional'),email=el('input'),dm=el('input'),dmLabel=el('label',ko?'Discord DM 링크 공개':'Share Discord DM link');contacts.className='guestbook-contact-options';email.type='email';email.maxLength=254;email.placeholder=ko?'공개 이메일 (선택)':'Public email (optional)';email.setAttribute('aria-label',email.placeholder);dm.type='checkbox';dmLabel.append(dm);contacts.append(contactTitle,email,dmLabel,el('small',ko?'입력한 연락처는 누구나 볼 수 있습니다. DM 수신 여부는 Discord 설정에 따릅니다.':'Contacts are public. Discord privacy settings may prevent messages.'));
      const update=()=>{const team=teams.find(t=>t.id===select.value);selectedLabel.textContent=team?.name||(ko?'소속 없음':'No team');hide.disabled=!team;if(!team)hide.checked=false;name.hidden=hide.checked;contacts.hidden=hide.checked;email.disabled=hide.checked;dm.disabled=hide.checked;};
      select.addEventListener('change',update);hide.addEventListener('change',update);update();
      form.append(preview,input,contacts);box.append(form);
      form.addEventListener('submit',async event=>{event.preventDefault();if(cooldownUntil>Date.now()){paintNotice();return;}posting=true;send.disabled=true;try{const result=await load('POST',{message:input.value,team:select.value,hideName:!!hide.checked,email:hide.checked?'':email.value.trim(),shareDiscord:!hide.checked&&!!dm.checked,...(replying?{parent:replying.id}:{})},replying?pageBefore:null);if(!replying)pageBefore=undefined;show(result);}catch(error){inform(error.message);}finally{posting=false;paintNotice();}});
    }else{const login=el('a',ko?'Discord로 로그인하고 남기기':'Sign in with Discord');login.href='/api/studio/login';box.append(login);}
    status.textContent='';status.setAttribute('role','status');(form||box).append(status);paintNotice();
  }
  load().then(show).catch(error=>{if(error.name!=='AbortError')inform(error.message);});
  return()=>{life.abort();if(timer)globalThis.clearTimeout?.(timer);if(pendingConfirmation)finishConfirmation(false);confirmation.remove?.();};
}
