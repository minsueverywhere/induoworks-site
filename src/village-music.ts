import catalog from '../content/catalog.json' with { type: 'json' };
import { villageTrack } from './scripts/village-tracks.mjs';
export const villageMusic = villageTrack(catalog);
