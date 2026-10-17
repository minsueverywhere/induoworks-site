// @ts-check
import { defineConfig } from 'astro/config';
import { execFileSync } from 'node:child_process';
import { loadEnv } from 'vite';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

import cloudflare from '@astrojs/cloudflare';
import { localEditorPlugin } from './scripts/editor-server.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://induo.works',
  output: 'static',
  devToolbar: { enabled: false },

  i18n: {
    locales: ['en', 'ko'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: false,
    },
  },

  vite: {
    plugins: [tailwindcss(), ...(process.env.INDUO_EDITOR==='1'?[localEditorPlugin()]:[])],
  },

  integrations: [
    {
      name: 'site-build-safety',
      hooks: {
        'astro:config:setup': ({ command }) => {
          if (command === 'build' && !loadEnv('production', process.cwd(), 'PUBLIC_').PUBLIC_TURNSTILE_SITE_KEY?.trim()) {
            throw new Error('PUBLIC_TURNSTILE_SITE_KEY is required to build the contact form.');
          }
        },
        'astro:build:done': () => {
          execFileSync(process.execPath, ['scripts/content-fallback.mjs'], { stdio: 'inherit' });
          execFileSync(process.execPath, ['scripts/generate-csp.mjs'], { stdio: 'inherit' });
        },
      },
    },
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en-US', ko: 'ko-KR' },
      },
    }),
  ],
  // Every page is prerendered, so images are optimized at build time. This
  // also keeps the public /_image runtime endpoint (billed per transform) off.
  adapter: cloudflare({ imageService: 'compile' }),
});
