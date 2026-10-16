import type { ImageMetadata } from 'astro';

/**
 * Single source of truth for site-wide content.
 * Edit here instead of hunting through templates.
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

export const projects: Project[] = [
  {
    slug: 'induoworks-site',
    year: '2026',
    stack: ['Astro', 'Tailwind CSS', 'Cloudflare Workers'],
    kind: 'site',
    status: 'shipped',
    href: 'https://induo.works',
    repo: 'https://github.com/minsueverywhere/induoworks-site',
    featured: true,
    title: { en: 'Induo Works Site', ko: 'Induo Works 웹사이트' },
    summary: {
      en: 'The Induo Works website. Built with Astro and hosted on Cloudflare.',
      ko: 'Induo Works의 웹사이트입니다. Astro로 만들고 Cloudflare에서 운영합니다.',
    },
    role: { en: 'Design & build', ko: '설계 및 개발' },
    challenge: {
      en: 'A website for our projects and contact information, in English and Korean.',
      ko: '프로젝트와 연락처를 영어와 한국어로 소개하는 사이트입니다.',
    },
    approach: {
      en: 'Content pages are static HTML. A Cloudflare Worker handles messages from the contact form.',
      ko: '콘텐츠는 정적 HTML로 제공하고, 문의 폼은 Cloudflare Worker에서 처리합니다.',
    },
    outcome: {
      en: 'The site is online. Content and layout are updated as the work changes.',
      ko: '사이트를 운영 중입니다. 작업 내용에 맞춰 문구와 구성을 수정합니다.',
    },
  },
  {
    slug: 'grench-boss',
    thumbnail: {
      src: '/work/media/grench-boss-concept-f042c0ca4feb.webp', width: 640, height: 360,
      alt: { en: 'GRENCH BOSS concept art with a goblin, a grounded airship and a jungle coast', ko: '고블린과 좌초된 비행선, 정글 해안이 있는 GRENCH BOSS 콘셉트 아트' },
      caption: { en: 'Concept art', ko: '콘셉트 아트' },
    },
    workerIds: ['frondward'],
    year: '2026',
    stack: ['Godot', 'GDScript', 'GDExtension (C++)'],
    kind: 'game',
    status: 'in-progress',
    featured: true,
    title: { en: 'GRENCH BOSS', ko: 'GRENCH BOSS' },
    summary: {
      en: 'A co-op base-defense game with building, enemy waves, and a pilotable airship. In development.',
      ko: '기지를 짓고 적을 막아내는 협동 게임입니다. 직접 조종하는 비행선이 있습니다. 개발 중입니다.',
    },
    role: { en: 'Design & engineering', ko: '기획 및 개발' },
    challenge: {
      en: 'Players build and defend a base together. An airship lets them travel to other combat areas.',
      ko: '여러 플레이어가 함께 기지를 짓고 방어합니다. 비행선으로 다른 전투 구역을 오갈 수 있습니다.',
    },
    approach: {
      en: 'Built in Godot. Current work includes enemy movement, modular base building, and airship controls.',
      ko: 'Godot로 개발합니다. 적 이동, 모듈형 기지 건설, 비행선 조작을 작업하고 있습니다.',
    },
    outcome: {
      en: 'In development. Work on the airship and a Steam demo is ongoing.',
      ko: '비행선 기능과 Steam 데모를 작업 중입니다.',
    },
  },
  {
    slug: 'yggbound',
    thumbnail: {
      src: '/work/media/yggbound-logo-eb79ac87fa35.webp', width: 640, height: 480,
      alt: { en: 'Yggbound logo with a world tree and runic ornaments', ko: '세계수와 룬 장식이 있는 Yggbound 로고' },
      caption: { en: 'Logo artwork', ko: '로고 아트워크' },
    },
    workerIds: ['frondward'],
    year: '2025',
    stack: ['Godot'],
    kind: 'game',
    status: 'paused',
    title: { en: 'Yggbound', ko: 'Yggbound' },
    summary: {
      en: 'An early Godot game project. Paused while we work on GRENCH BOSS.',
      ko: '초기에 만들던 Godot 게임입니다. GRENCH BOSS 개발 중에는 보류합니다.',
    },
    role: { en: 'Design & engineering', ko: '기획 및 개발' },
    challenge: {
      en: 'An early game prototype.',
      ko: '초기 게임 프로토타입입니다.',
    },
    approach: {
      en: 'The first prototype was built in Godot.',
      ko: 'Godot로 첫 프로토타입을 만들었습니다.',
    },
    outcome: {
      en: 'Paused. No release date.',
      ko: '개발을 보류했습니다. 출시일은 정하지 않았습니다.',
    },
  },
  {
    slug: 'rooftop-alien',
    workerIds: ['frondward'],
    year: '2025',
    stack: ['Godot'],
    kind: 'game',
    status: 'paused',
    title: { en: 'Rooftop Alien', ko: 'Rooftop Alien' },
    summary: {
      en: 'A Godot game prototype. Currently paused.',
      ko: 'Godot 게임 프로토타입입니다. 현재 개발을 보류했습니다.',
    },
    role: { en: 'Design & engineering', ko: '기획 및 개발' },
    challenge: {
      en: 'A small game prototype made to try an idea.',
      ko: '아이디어를 시험하기 위해 만든 작은 게임 프로토타입입니다.',
    },
    approach: {
      en: 'Only a basic prototype was made.',
      ko: '기본적인 프로토타입까지 만들었습니다.',
    },
    outcome: {
      en: 'Paused. No release date.',
      ko: '개발을 보류했습니다. 출시일은 정하지 않았습니다.',
    },
  },
];

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

export const workers: Worker[] = [{
  id: 'frondward',
  name: 'Frondward',
  description: {
    en: 'An independent game studio. Explore the games being made in this workshop.',
    ko: '독립 게임 개발사입니다. 이 작업실에서 만드는 게임들을 만나보세요.',
  },
  logoMediaId: 'frondward-logo',
  house: { x: 7, y: 7 },
}];

export const villageNotices: { id: string; title: LocalizedText; body: LocalizedText; href?: string; linkLabel?: LocalizedText }[] = [{
  id: 'residents-wanted',
  title: { en: 'Residents wanted', ko: '주민 모집' },
  body: {
    en: 'Make yourself at home in Induohood. Independent creators and studios making games, music, art and other works are welcome. Get in touch if you would like to share your work in a workshop here.',
    ko: '인듀오후드에 함께할 주민을 찾습니다. 게임, 음악, 아트 등 자신만의 작품을 만드는 개인 창작자와 개발사 모두 환영해요. 이곳에 작업실을 열고 작품을 소개하고 싶다면 연락해 주세요.',
  },
  href: '/contact/',
  linkLabel: { en: 'Contact · Join the village', ko: 'Contact · 참여 문의' },
}];

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
