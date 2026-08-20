/**
 * Single source of truth for site-wide content.
 * Edit here instead of hunting through templates.
 */

export const site = {
  name: 'InduoWorks',
  tagline: 'Software that earns its keep.',
  description:
    'InduoWorks builds fast, reliable web software — portfolio, engineering showcase, and open roles.',
  // Update alongside `site` in astro.config.mjs when the custom domain lands.
  url: 'https://induoworks-site.pages.dev',
  locale: 'en',
  // Public contact email shown on the site — set this or leave the contact
  // form as the only channel (see /src/pages/contact.astro).
  email: '',
  github: 'https://github.com/minsueverywhere',
} as const;

export const nav = [
  { href: '/', label: 'Home' },
  { href: '/work/', label: 'Work' },
  { href: '/showcase/', label: 'Showcase' },
  { href: '/careers/', label: 'Careers' },
  { href: '/contact/', label: 'Contact' },
] as const;

export type Project = {
  slug: string;
  title: string;
  summary: string;
  year: string;
  role: string;
  stack: string[];
  href?: string;
  repo?: string;
  featured?: boolean;
};

export const projects: Project[] = [
  {
    slug: 'induoworks-site',
    title: 'InduoWorks Site',
    summary:
      'This site. Static Astro build on Cloudflare Pages — zero-JS by default, edge-cached worldwide, serverless contact handling.',
    year: '2026',
    role: 'Design & build',
    stack: ['Astro', 'Tailwind CSS', 'Cloudflare Pages'],
    repo: 'https://github.com/minsueverywhere/induoworks-site',
    featured: true,
  },
];

export type ShowcaseItem = {
  title: string;
  blurb: string;
  detail: string;
  tags: string[];
};

export const showcase: ShowcaseItem[] = [
  {
    title: 'Edge-first static delivery',
    blurb: 'Every page is prebuilt HTML served from Cloudflare’s global edge.',
    detail:
      'No server to wait on, no cold starts, no database round trip. Pages are rendered at build time and cached in 300+ cities, so first paint is limited by the speed of light rather than by our infrastructure.',
    tags: ['Performance', 'Astro', 'Cloudflare'],
  },
  {
    title: 'Zero-JavaScript baseline',
    blurb: 'Interactive only where interaction is the point.',
    detail:
      'Astro ships no client-side framework runtime by default. The handful of interactive pieces here — theme toggle, mobile menu, contact form — are small, self-contained scripts, so the site stays usable on slow connections and old hardware.',
    tags: ['Performance', 'Accessibility'],
  },
  {
    title: 'Hardened by default',
    blurb: 'Strict security headers, no secrets in the repository.',
    detail:
      'A content security policy, frame denial, and strict referrer rules ship with every response. The one server-side path — the contact endpoint — validates input, rate-limits by IP, and reads its API credentials from encrypted environment bindings that never touch source control.',
    tags: ['Security', 'Cloudflare'],
  },
];

export type Role = {
  title: string;
  type: string;
  location: string;
  summary: string;
  responsibilities: string[];
  open: boolean;
};

export const roles: Role[] = [
  {
    title: 'Frontend Engineer',
    type: 'Full-time',
    location: 'Remote / Seoul',
    summary:
      'Build product surfaces that stay fast under real-world conditions — slow networks, old devices, large datasets.',
    responsibilities: [
      'Own features end to end, from interaction design through shipping',
      'Hold a high bar on performance budgets and accessibility',
      'Write the kind of code the next person can safely change',
    ],
    open: true,
  },
];
