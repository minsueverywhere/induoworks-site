export const INTAKE_FILE_BYTES=8*1024*1024;
export const MEDIA_MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',avif:'image/avif',gif:'image/gif',ogg:'audio/ogg',mp3:'audio/mpeg'};
export function validateMediaFile(name,bytes,max=25*1024*1024){
  if(!bytes.length||bytes.length>max)throw Error('Media must be between 1 byte and '+(max===25*1024*1024?'25 MiB':max+' bytes'));
  const ext=name.split('.').pop().toLowerCase(),ascii=(a,b)=>String.fromCharCode(...bytes.subarray(a,b));
  const valid={
    ogg:ascii(0,4)==='OggS'&&ascii(0,Math.min(bytes.length,4096)).includes('OpusHead'),
    mp3:ascii(0,3)==='ID3'||bytes[0]===255&&(bytes[1]&224)===224,
    png:[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v),
    webp:ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP',
    jpg:bytes[0]===255&&bytes[1]===216&&bytes[2]===255,
    jpeg:bytes[0]===255&&bytes[1]===216&&bytes[2]===255,
    avif:ascii(4,8)==='ftyp'&&['avif','avis'].includes(ascii(8,12)),
    gif:['GIF87a','GIF89a'].includes(ascii(0,6)),
  }[ext];
  if(!valid)throw Error('Unsupported or mismatched media: '+name+' (Opus Ogg / MP3; no WAV)');
  return {extension:ext,kind:['ogg','mp3'].includes(ext)?'music':'image',mime:MEDIA_MIME[ext]};
}
