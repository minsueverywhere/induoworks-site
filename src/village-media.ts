import catalog from '../content/catalog.json' with { type: 'json' };
export const villageMedia = catalog.media as Array<(typeof catalog.media)[number]&{description?:{ko:string;en:string}}>;
