// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // TODO: update to your final custom domain once connected in Cloudflare Pages
  // (e.g. https://induoworks.com). Needed for correct sitemap/canonical URLs.
  site: 'https://induoworks-site.pages.dev',

  output: 'static',

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [sitemap()],
});
