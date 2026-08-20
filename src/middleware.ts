import { defineMiddleware } from 'astro:middleware';

const CANONICAL_HOST = 'induo.works';

/**
 * Redirects www.induo.works (and any other stray host pointed at this
 * Worker) to the canonical apex domain, preserving path + query string.
 * Runs on every request — Astro wires this into the Cloudflare Worker
 * regardless of which adapter Cloudflare's build pipeline applies, so it
 * doesn't depend on finding the right Cloudflare dashboard menu.
 */
export const onRequest = defineMiddleware((context, next) => {
  const url = new URL(context.request.url);

  if (url.hostname !== CANONICAL_HOST && url.hostname.endsWith('induo.works')) {
    url.hostname = CANONICAL_HOST;
    return context.redirect(url.toString(), 301);
  }

  return next();
});
