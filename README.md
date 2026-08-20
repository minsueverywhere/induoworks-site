# InduoWorks

Static site — portfolio, engineering showcase, careers, and contact — built with
[Astro](https://astro.build) + [Tailwind CSS](https://tailwindcss.com), deployed on
[Cloudflare Pages](https://pages.cloudflare.com).

Design goals: minimal hosting cost (Cloudflare Pages free tier), maximum performance
(prebuilt static HTML, zero client-side JS by default), and a small, auditable
security surface (no database, no server secrets in the repo, strict security headers).

## Stack

- **Astro** (`output: 'static'`) — every page is prebuilt HTML at build time
- **Tailwind CSS v4** — utility CSS, no runtime cost
- **Cloudflare Pages** — hosting + global CDN + free TLS
- **Cloudflare Pages Functions** (`/functions/api/contact.ts`) — the *only* server-side
  code, handling the contact form
- **Resend** — transactional email for contact form delivery
- **Cloudflare Turnstile** — bot protection on the contact form (optional but recommended)

## Project structure

```text
/
├── functions/
│   └── api/contact.ts     # Cloudflare Pages Function — contact form endpoint
├── public/
│   ├── _headers           # security headers (CSP, HSTS, etc.)
│   └── robots.txt
├── src/
│   ├── components/        # Header, Footer, SEO, ThemeToggle
│   ├── layouts/Layout.astro
│   ├── pages/              # routes: /, /work, /showcase, /careers, /contact
│   └── config.ts           # <- edit site copy, projects, roles here
└── astro.config.mjs
```

Most day-to-day content edits (projects, showcase items, open roles, site copy)
happen in [`src/config.ts`](src/config.ts) — you shouldn't need to touch the page
templates for routine updates.

## Local development

```bash
npm install
npm run dev        # http://localhost:4321
```

To test the contact form locally (including the Cloudflare Function), copy
`.dev.vars.example` to `.dev.vars`, fill in real values, then:

```bash
npm run pages:dev  # builds + runs via wrangler, so /api/contact works
```

## Deploying (one-time setup)

1. **Push this repo to GitHub** (already done if you're reading this from the repo).
2. **Cloudflare Pages → create a project → Connect to Git**, select this repo.
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Framework preset: Astro
3. **Environment variables** (Cloudflare Pages dashboard → your project →
   Settings → Environment variables). Set these for the **Production**
   environment (and Preview, if you want the form to work on preview deploys):

   | Variable | Type | Notes |
   |---|---|---|
   | `RESEND_API_KEY` | Secret | From [resend.com](https://resend.com) (free tier: 3,000 emails/mo) |
   | `CONTACT_TO_EMAIL` | Secret | Inbox that receives form submissions |
   | `CONTACT_FROM_EMAIL` | Secret | Verified sender in Resend (a domain you verify there, or `onboarding@resend.dev` for testing) |
   | `TURNSTILE_SECRET_KEY` | Secret | From the Cloudflare Turnstile dashboard |
   | `PUBLIC_TURNSTILE_SITE_KEY` | Plaintext (build-time) | Same Turnstile widget, public site key — needed at **build** time, not just runtime |

   None of these ever go in the repo. `.env` and `.dev.vars` are gitignored.

4. **Turnstile**: Cloudflare dashboard → Turnstile → Add site → widget mode
   "Managed" → copy the Site Key into `PUBLIC_TURNSTILE_SITE_KEY` and the
   Secret Key into `TURNSTILE_SECRET_KEY`. If you skip this, the contact form
   still works — it just skips bot verification.
5. **Custom domain** (optional): Pages project → Custom domains → add your
   domain (DNS can also live on Cloudflare for one-click setup). Afterwards,
   update `site` in [`astro.config.mjs`](astro.config.mjs) and
   [`src/config.ts`](src/config.ts) to the real domain and redeploy, so
   canonical URLs / sitemap / OG tags are correct.
6. Push to `main` → Cloudflare Pages builds and deploys automatically on every push.

## Security notes

- No database, no user accounts, no cookies — nothing to breach.
- The only server-side logic is the contact endpoint, which validates input,
  checks a honeypot field, optionally verifies Turnstile, and forwards to
  email via Resend. It never stores submissions anywhere.
- Secrets live only in Cloudflare's encrypted environment variables, never
  in git.
- `public/_headers` sets a Content-Security-Policy, HSTS, frame-denial, and
  restrictive Permissions-Policy on every response, Cloudflare Pages applies
  these at the edge automatically.
- Being a **public** repository doesn't expose anything sensitive: the
  frontend code is delivered to every visitor's browser regardless (view-source
  already shows it), and the one server function reads its credentials from
  environment bindings that are never committed. Public repos additionally
  get free GitHub Dependabot + secret-scanning alerts.
- Recommended (optional, free): in the Cloudflare dashboard, add a Rate
  Limiting rule on `POST /api/contact` for extra abuse protection beyond
  Turnstile.
