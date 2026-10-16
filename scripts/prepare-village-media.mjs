import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const [source, name] = process.argv.slice(2);
if (!source || !/^[a-z0-9-]+$/.test(name || '')) throw new Error('Usage: node scripts/prepare-village-media.mjs <image> <lowercase-name>');
const original = await readFile(source);
const metadata = await sharp(original).metadata();
if (!['png', 'jpeg', 'webp', 'avif'].includes(metadata.format)) throw new Error('Use a PNG, JPEG, WebP or AVIF image.');
const hash = createHash('sha256').update(original).digest('hex').slice(0,12);
const stem = `${name}-${hash}`;
const directory = fileURLToPath(new URL('../public/village/media/',import.meta.url));
await mkdir(directory,{recursive:true});
const filename = `${stem}.${metadata.format === 'jpeg' ? 'jpg' : metadata.format}`;
await writeFile(directory+filename,original);
for (const [variant,width] of [['badge',96],['preview',480]]) {
  await sharp(original).rotate().resize({width,withoutEnlargement:true}).webp({quality:80}).toFile(`${directory}${stem}-${variant}.webp`);
}
console.log(JSON.stringify({id:name,badge:`/village/media/${stem}-badge.webp`,preview:`/village/media/${stem}-preview.webp`,original:`/village/media/${filename}`,bytes:original.length,width:metadata.width,height:metadata.height},null,2));
