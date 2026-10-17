// Store a URL, never participant-supplied embed HTML.
export function externalWork(value) {
  if(typeof value!=='string'||value.length>2048||/[\s\\\x00-\x1f]/.test(value))throw Error('지원하는 공개 링크를 입력해 주세요.');
  let url;try{url=new URL(value);}catch{throw Error('올바른 HTTPS 링크를 입력해 주세요.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('공개 HTTPS 링크만 사용할 수 있습니다.');
  const host=url.hostname;
  if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(host)){
    const id=host==='youtu.be'?url.pathname.slice(1):url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)$/)?.[1];
    if(!/^[\w-]{11}$/.test(id||''))throw Error('YouTube 영상 링크를 입력해 주세요.');
    return {provider:'YouTube',kind:'embed',url:'https://www.youtube.com/watch?v='+id,src:'https://www.youtube-nocookie.com/embed/'+id};
  }
  if(['soundcloud.com','www.soundcloud.com'].includes(host)){
    if(!/^\/[\w-]+\/[\w-]+\/?$/.test(url.pathname)||/^\/(?:discover|search|you|settings)\//.test(url.pathname))throw Error('SoundCloud 개별 곡의 공개 링크를 입력해 주세요.');
    const canonical='https://soundcloud.com'+url.pathname.replace(/\/$/,'');
    return {provider:'SoundCloud',kind:'embed',url:canonical,src:'https://w.soundcloud.com/player/?url='+encodeURIComponent(canonical)+'&auto_play=false'};
  }
  if(host==='github.com'){
    const match=url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if(!match)throw Error('GitHub 저장소의 개별 공개 파일 링크를 입력해 주세요.');
    url=new URL('https://raw.githubusercontent.com/'+match[1]+'/'+match[2]+'/'+match[3]);
  }else if(host!=='raw.githubusercontent.com')throw Error('YouTube, SoundCloud, GitHub 공개 파일 링크를 사용해 주세요.');
  if(!/^\/[^/]+\/[^/]+\/[^/]+\/.+/.test(url.pathname)||/%(?:2f|5c|00)/i.test(url.pathname))throw Error('GitHub 파일 링크가 올바르지 않습니다.');
  const ext=url.pathname.split('.').pop().toLowerCase(),kind=['png','jpg','jpeg','webp','gif','avif'].includes(ext)?'image':['ogg','mp3','m4a'].includes(ext)?'audio':null;
  if(!kind)throw Error('GitHub 파일은 PNG·JPEG·WebP·GIF·AVIF 이미지 또는 OGG·MP3·M4A 음원이어야 합니다.');
  url.search='';url.hash='';
  return {provider:'GitHub',kind,url:url.href,src:url.href};
}

export function externalPreview(value){
  if(!value)return '';
  const source=externalWork(value);return source.kind==='image'?source.src:'';
}
