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
  name: 'InduoWorks',
  url: 'https://induo.works',
  // Public contact email shown on the site — set this or leave the contact
  // form as the only channel (see src/pages/contact/index.astro).
  email: '',
  github: 'https://github.com/minsueverywhere',
} as const;

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
  kind: 'site' | 'game' | 'experiment';
  status: 'shipped' | 'in-progress';
  href?: string;
  repo?: string;
  steamUrl?: string;
  cover?: ImageMetadata;
  gallery?: ProjectGalleryItem[];
  featured?: boolean;
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
    title: { en: 'InduoWorks Site', ko: 'InduoWorks 웹사이트' },
    summary: {
      en: 'This site. An Astro project on Cloudflare Workers — zero-JS by default, edge-cached worldwide, with serverless contact handling.',
      ko: '지금 보고 계신 이 사이트입니다. Cloudflare Workers 위에서 동작하는 Astro 빌드로, 기본적으로 JS를 거의 쓰지 않고 전 세계에 엣지 캐싱되며, 문의 처리도 서버리스로 이루어집니다.',
    },
    role: { en: 'Design & build', ko: '설계 및 개발' },
    challenge: {
      en: 'Build a bilingual studio site that feels immediate on any device while keeping one dependable server-side contact path and no database.',
      ko: '어떤 기기에서도 즉시 열리는 이중 언어 스튜디오 사이트를 만들되, 데이터베이스 없이 신뢰할 수 있는 서버 문의 경로 하나를 유지하는 것이 목표였습니다.',
    },
    approach: {
      en: 'Astro prerenders every content page. Cloudflare Workers handles only the contact endpoint, while small dependency-free scripts cover theme, navigation, and form interactions.',
      ko: '모든 콘텐츠 페이지는 Astro로 미리 렌더링하고, Cloudflare Workers는 문의 엔드포인트만 처리합니다. 테마·내비게이션·폼 인터랙션은 의존성 없는 작은 스크립트로 구성했습니다.',
    },
    outcome: {
      en: 'The result is a compact, globally cached site with no client framework runtime, bilingual canonical routes, strict security headers, and a protected email workflow.',
      ko: '클라이언트 프레임워크 런타임 없이 전 세계에 캐싱되는 가벼운 사이트, 이중 언어 canonical 경로, 엄격한 보안 헤더와 보호된 이메일 문의 흐름을 완성했습니다.',
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

export const labs: Lab[] = [
  {
    slug: 'gpu-interference',
    year: '2026',
    stack: ['WebGPU', 'WGSL', 'TypeScript'],
    title: { en: 'GPU Interference', ko: 'GPU 인터퍼런스' },
    summary: {
      en: 'A small, interactive interference field rendered entirely on the GPU.',
      ko: 'GPU에서 전부 렌더링하는 작고 인터랙티브한 간섭무늬 실험입니다.',
    },
    description: {
      en: 'Two moving wave sources are evaluated for every pixel in a WGSL fragment shader. The demo loads no GPU resources until you start it, pauses when the tab is hidden, and keeps a static fallback for browsers without WebGPU.',
      ko: 'WGSL 프래그먼트 셰이더가 모든 픽셀에서 움직이는 두 파동의 간섭을 계산합니다. 시작 버튼을 누르기 전에는 GPU 리소스를 만들지 않고, 탭이 숨겨지면 멈추며, WebGPU를 지원하지 않는 브라우저에는 정적 대체 화면을 제공합니다.',
    },
  },
];

export type ShowcaseItem = {
  tags: string[];
  title: LocalizedText;
  blurb: LocalizedText;
  detail: LocalizedText;
};

export const showcase: ShowcaseItem[] = [
  {
    tags: ['Tag'],
    title: { en: 'Title', ko: '제목' },
    blurb: {
      en: 'Description',
      ko: '설명',
    },
    detail: {
      en: '',
      ko: '',
    },
  },
];

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
