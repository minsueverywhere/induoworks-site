# InduoWorks

Site — portfolio, engineering showcase, careers, and contact — built with
[Astro](https://astro.build) + [Tailwind CSS](https://tailwindcss.com), deployed on
[Cloudflare Workers](https://workers.cloudflare.com) via the official
[`@astrojs/cloudflare`](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) adapter.

Design goals: minimal hosting cost (Cloudflare's free tier), maximum performance
(prebuilt static HTML for every page, zero client-side JS by default), and a small,
auditable security surface (no database, no server secrets in the repo, strict
security headers).

> Note: this project started out targeting classic Cloudflare Pages with a plain
> `output: 'static'` build. Cloudflare's git-connected build pipeline now applies
> the Cloudflare adapter automatically for Astro projects regardless, so the
> adapter is configured explicitly here to keep local builds and the real
> deployment identical. Every page still prerenders to static HTML — only
> `/api/contact` runs per-request.

## Stack

- **Astro** (`@astrojs/cloudflare` adapter, most routes prerendered) — every page
  except the contact API is prebuilt HTML at build time
- **Tailwind CSS v4** — utility CSS, no runtime cost
- **Cloudflare Workers** — hosting + global CDN + free TLS
- **`src/pages/api/contact.ts`** — the *only* on-demand (non-prerendered) route,
  handling the contact form
- **Resend** — transactional email for contact form delivery
- **Cloudflare Turnstile** — bot protection on the contact form (optional but recommended)

## Project structure

```text
/
├── public/
│   ├── logos/              # company logos for the /companies page (see below)
│   ├── og.png              # default 1200×630 social sharing image
│   ├── _headers            # security headers (CSP, HSTS, etc.) — base rules;
│   │                       # scripts/generate-csp.mjs appends script hashes at build time
│   └── robots.txt
├── src/
│   ├── components/         # Header, Footer, SEO, ThemeToggle — all locale-aware
│   ├── views/               # actual page markup, one file per page, takes a `lang` prop
│   ├── layouts/Layout.astro
│   ├── middleware.ts        # redirects www.induo.works -> induo.works
│   ├── i18n.ts               # locale list + all UI copy (nav, buttons, headings)
│   ├── pages/
│   │   ├── api/contact.ts    # contact form endpoint (prerender = false)
│   │   ├── ko/                # Korean routes — thin wrappers around src/views/*
│   │   └── ...                 # English (default) routes, same pattern
│   └── config.ts             # <- edit site copy, projects, companies, roles here
├── astro.config.mjs
└── wrangler.jsonc            # Cloudflare Worker config (name, assets, bindings)
```

Most day-to-day content edits (projects, showcase items, companies, open
roles) happen in [`src/config.ts`](src/config.ts) — translatable fields are
`{ en, ko }` pairs right next to the field. UI labels/buttons live in
[`src/i18n.ts`](src/i18n.ts). Actual page layout lives once per page in
`src/views/`; the files under `src/pages/` (and `src/pages/ko/`) are thin
wrappers that just pick a language.

**Adding a company logo**: drop the image at `public/logos/<name>.svg` (or
`.png`), then set `logo: '/logos/<name>.svg'` on that company's entry in
`src/config.ts`. No logo set — it shows a monogram badge instead, so nothing
breaks in the meantime.

### Adding work, galleries, Steam links, and Labs

- Add projects in `src/config.ts`. `href`, `repo`, and `steamUrl` become action
  buttons automatically. `status` and `kind` control the case-study metadata.
- Import local images in `src/config.ts`, assign one to `cover`, and add
  `{ src, alt: { en, ko }, caption? }` entries to `gallery`. Astro generates
  responsive image variants at build time.
- Add short experiments to the `labs` array. The bilingual list/detail routes
  are generated automatically; connect a new interactive component in
  `src/views/LabDetailView.astro`.
- WebGPU demos belong on their own Lab detail route. Feature-detect WebGPU,
  initialize it only after user interaction, and retain a non-WebGPU fallback.

## Local development

```bash
npm install
npm run dev        # http://localhost:4321 — fast iteration, no Cloudflare bindings
```

`npm run dev` is enough for everything except the contact form (it needs
Cloudflare env bindings, which only exist under `wrangler`). To test the
contact form locally, copy `.dev.vars.example` to `.dev.vars`, fill in real
values, then:

```bash
npm run worker:dev   # builds + runs via `wrangler dev`, so /api/contact works
```

## Deploying

This repo is connected to Cloudflare via git — **push to `main` and Cloudflare
builds + deploys automatically.** Nothing to run locally for normal deploys.

One-time setup (already done for this project, kept here for reference):

1. **Cloudflare dashboard → Workers & Pages → Create application → Connect to Git**,
   select this repo. Build command `npm run build`, framework preset Astro.
2. **Environment variables** (project → Settings → Environment variables, Production
   — and Preview too, if you want the form to work on preview deploys):

   | Variable | Type | Notes |
   |---|---|---|
   | `RESEND_API_KEY` | Secret | From [resend.com](https://resend.com) (free tier: 3,000 emails/mo) |
   | `CONTACT_TO_EMAIL` | Secret | Inbox that receives form submissions |
   | `CONTACT_FROM_EMAIL` | Secret | Sender on a domain already verified in Resend, e.g. `InduoWorks <contact@induo.works>` |
   | `TURNSTILE_SECRET_KEY` | Secret | From the Cloudflare Turnstile dashboard |
   | `PUBLIC_TURNSTILE_SITE_KEY` | Plaintext (build-time) | Same Turnstile widget, public site key — needed at **build** time, not just runtime |

   None of these ever go in the repo. `.env` and `.dev.vars` are gitignored.

   Before deploying, add `induo.works` under **Resend → Domains** and publish
   the DNS records Resend supplies. Wait until its status is **Verified** before
   using an `@induo.works` address in `CONTACT_FROM_EMAIL`. The fallback sender
   `onboarding@resend.dev` is testing-only and can send only to the email address
   associated with the Resend account.

3. **Turnstile**: Cloudflare dashboard → Turnstile → Add site → widget mode
   "Managed" → copy the Site Key into `PUBLIC_TURNSTILE_SITE_KEY` and the
   Secret Key into `TURNSTILE_SECRET_KEY`. Make sure every hostname the site is
   reachable at (the `*.workers.dev` URL, `induo.works`, `www.induo.works`) is
   listed as an allowed domain on the widget, or verification fails.
4. **Custom domain**: project → Settings → Domains & Routes → Add → Custom Domain.
   If the domain shows "externally managed DNS records" when adding it, delete
   the conflicting A/CNAME records under DNS → Records first (leave MX/TXT/DKIM
   records alone — those are for email, unrelated to this).
   `www` doesn't need a separate redirect rule — it's added as its own Custom
   Domain and [`src/middleware.ts`](src/middleware.ts) redirects it to the apex.

## Security notes

- No database, no user accounts, no cookies — nothing to breach.
- The only server-side logic is the contact endpoint, which validates input,
  checks a honeypot field, optionally verifies Turnstile, and forwards to
  email via Resend. It never stores submissions anywhere.
- Secrets live only in Cloudflare's encrypted environment variables, never in git.
- `public/_headers` sets a Content-Security-Policy, HSTS, frame-denial, and
  restrictive Permissions-Policy on every response. Astro inlines some
  per-page scripts directly into the HTML for performance; rather than
  weaken the CSP with `'unsafe-inline'`, [`scripts/generate-csp.mjs`](scripts/generate-csp.mjs)
  runs after every build, hashes exactly the inline scripts present, and
  allow-lists those hashes — no manual maintenance needed as code changes.
- Being a **public** repository doesn't expose anything sensitive: the
  frontend code is delivered to every visitor's browser regardless (view-source
  already shows it), and the one server function reads its credentials from
  environment bindings that are never committed. Public repos additionally
  get free GitHub Dependabot + secret-scanning alerts.
- Recommended (optional, free): in the Cloudflare dashboard, add a Rate
  Limiting rule on `POST /api/contact` for extra abuse protection beyond
  Turnstile.
