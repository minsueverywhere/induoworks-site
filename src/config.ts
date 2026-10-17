import catalog from '../content/catalog.json' with { type: 'json' };
import type { ImageMetadata } from 'astro';

/**
 * Site settings and typed access to the content/catalog.json build snapshot.
 * Edit content/catalog.json for village creators and works.
 *
 * Text that differs by language lives in a `{ en, ko }` pair right next to
 * the field it belongs to. Fields that don't need translating (slugs, years,
 * stack names, links) stay flat.
 */

export const site = {
  name: 'Induo Works',
  url: 'https://induo.works',
  // Public contact email shown on the site — set this or leave the contact
  // form as the only channel (see src/pages/contact/index.astro).
  email: 'contact@induo.works',
  github: 'https://github.com/minsueverywhere',
} as const;

export const socialLinks = [
  { name: 'Discord', icon: 'discord', href: 'https://discord.gg/VnnvH22ZKJ' },
  { name: 'YouTube', icon: 'youtube', href: 'https://www.youtube.com/@InduoWorks' },
  { name: 'Patreon', icon: 'patreon', href: 'https://www.patreon.com/c/induoworks' },
  { name: 'Instagram', icon: 'instagram', href: 'https://www.instagram.com/induoworks/' },
  { name: 'X', icon: 'x', href: 'https://x.com/induoworks' },
  { name: 'Facebook', icon: 'facebook', href: 'https://www.facebook.com/profile.php?id=61595485407391' },
  { name: 'TikTok', icon: 'tiktok', href: 'https://www.tiktok.com/@induoworks' },
  { name: 'GitHub', icon: 'github', href: site.github },
] as const;

export type LocalizedText = { en: string; ko: string };

export type ProjectGalleryItem = {
  src: ImageMetadata;
  alt: LocalizedText;
  caption?: LocalizedText;
};

export type Project = {
  slug: string;
  year: string;
  stack: string[];
  kind: 'site' | 'game' | 'music' | 'artwork' | 'experiment';
  status: 'shipped' | 'in-progress' | 'paused';
  href?: string;
  repo?: string;
  steamUrl?: string;
  cover?: ImageMetadata;
  thumbnail?: { src: string; width: number; height: number; alt: LocalizedText; caption: LocalizedText };
  gallery?: ProjectGalleryItem[];
  featured?: boolean;
  workerIds?: string[];
  tags?: string[];
  title: LocalizedText;
  summary: LocalizedText;
  role: LocalizedText;
  challenge: LocalizedText;
  approach: LocalizedText;
  outcome: LocalizedText;
};

export const projects: Project[] = catalog.projects as Project[];

export type Lab = {
  slug: string;
  year: string;
  stack: string[];
  title: LocalizedText;
  summary: LocalizedText;
  description: LocalizedText;
};

export const labs: Lab[] = [];

export type ShowcaseItem = {
  tags: string[];
  title: LocalizedText;
  blurb: LocalizedText;
  detail: LocalizedText;
};

export const showcase: ShowcaseItem[] = [
  {
    tags: ['Performance', 'Astro', 'Cloudflare'],
    title: { en: 'Static pages', ko: '정적 페이지' },
    blurb: {
      en: "Pages are built with Astro and served by Cloudflare.",
      ko: 'Astro로 빌드한 HTML을 Cloudflare에서 제공합니다.',
    },
    detail: {
      en: 'Astro generates the content pages at build time. Cloudflare serves the files. The contact form is the only server endpoint.',
      ko: 'Astro로 콘텐츠 페이지를 미리 빌드하고 Cloudflare에서 제공합니다. 문의 폼만 서버에서 처리합니다.',
    },
  },
  {
    tags: ['Performance', 'Accessibility'],
    title: { en: 'Browser scripts', ko: '브라우저 스크립트' },
    blurb: {
      en: 'Small scripts handle navigation, themes, and the contact form.',
      ko: '메뉴, 테마, 문의 폼에 작은 스크립트를 사용합니다.',
    },
    detail: {
      en: 'Most pages use HTML and CSS. Small scripts handle the village, work filters, menu, theme switch, and contact form.',
      ko: '대부분의 페이지는 HTML과 CSS로 구성합니다. 마을, 작업물 필터, 메뉴, 테마 전환, 문의 폼에는 스크립트를 사용합니다.',
    },
  },
  {
    tags: ['Security', 'Cloudflare'],
    title: { en: 'Contact form', ko: '문의 폼' },
    blurb: {
      en: 'Messages are checked and sent by a Cloudflare Worker.',
      ko: 'Cloudflare Worker에서 메시지를 확인하고 전달합니다.',
    },
    detail: {
      en: 'The contact endpoint validates messages, limits repeated requests, and sends email through Resend. API keys are stored in server environment bindings.',
      ko: '문의 엔드포인트에서 입력값을 확인하고 반복 요청을 제한한 뒤 Resend로 이메일을 보냅니다. API 키는 서버 환경 변수로 관리합니다.',
    },
  },
];

export type Worker = {
  id: string;
  name: string;
  description: LocalizedText;
  href?: string;
  logoMediaId?: string;
  house?: { x: number; y: number };
};

export const workers: Worker[] = catalog.workers;
export const villageNotices: { id: string; title: LocalizedText; body: LocalizedText; href?: string; linkLabel?: LocalizedText }[] = catalog.notices;

export function worksByWorker(workerId: string) {
  return projects.filter(project => project.workerIds?.includes(workerId));
}

export type Company = {
  slug: string;
  name: string; // brand names are shown as-is, not translated
  href?: string;
  /** Path under /public, e.g. '/logos/wispward.svg'. Omit to show a monogram badge. */
  logo?: string;
  tagline: LocalizedText;
  published?: boolean;
};

export const companies: Company[] = [
  {
    slug: 'wispward',
    name: 'WISPWARD',
    published: false,
    // TODO: swap in the real one-line description (and `href`/`logo`) once provided.
    tagline: {
      en: 'Description coming soon.',
      ko: '소개 문구 준비 중입니다.',
    },
  },
];

export type Role = {
  title: LocalizedText;
  type: LocalizedText;
  location: LocalizedText;
  summary: LocalizedText;
  responsibilities: LocalizedText[];
  open: boolean;
};

// No open roles right now. Add entries here when hiring — the careers page
// and homepage CTA automatically pick them up.
export const roles: Role[] = [];
