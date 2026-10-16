import test from 'node:test';
import assert from 'node:assert/strict';
import { createVillageMusic } from '../src/scripts/village-music.mjs';

test('music is requested only on play, loops, and prefers Opus', async () => {
  let created = 0, audio;
  const states = [];
  const createAudio = () => { created++; audio = { canPlayType: t => t.includes('opus') ? 'probably' : '', addEventListener() {}, play: async () => {}, pause() {} }; return audio; };
  const music = createVillageMusic({ sources: { ogg: '/a.ogg', mp3: '/a.mp3' }, onState: s => states.push(s), createAudio });
  assert.equal(created, 0);
  await music.toggle();
  assert.equal(audio.src, '/a.ogg'); assert.equal(audio.loop, true); assert.equal(audio.preload, 'none');
  await music.toggle();
  assert.deepEqual(states, ['loading', 'playing', 'stopped']);
});
