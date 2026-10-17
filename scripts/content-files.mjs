import { MAX_FILE_BYTES } from '../src/content-schema.mjs';

export function validateMediaFile(name, bytes) {
  if (!bytes.length || bytes.length>MAX_FILE_BYTES) throw new Error('Media must be between 1 byte and 25 MiB');
  const ext=name.split('.').pop().toLowerCase();
  const ascii=(start,end)=>bytes.subarray(start,end).toString('ascii');
  const valid={
    ogg: ascii(0,4)==='OggS' && bytes.includes(Buffer.from('OpusHead')),
    mp3: ascii(0,3)==='ID3' || bytes[0]===0xff && (bytes[1]&0xe0)===0xe0,
    png: bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    webp: ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP',
    jpg: bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff,
    jpeg: bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff,
    avif: ascii(4,8)==='ftyp' && ['avif','avis'].includes(ascii(8,12)),
    gif: ['GIF87a','GIF89a'].includes(ascii(0,6)),
  }[ext];
  if (!valid) throw new Error('Unsupported or mismatched media: '+name+' (audio: Opus Ogg / MP3; no WAV)');
}
