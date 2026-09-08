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
  {
    slug: 'grench-boss',
    year: '2026',
    stack: ['Godot', 'GDScript', 'GDExtension (C++)'],
    kind: 'game',
    status: 'in-progress',
    featured: true,
    title: { en: 'GRENCH BOSS', ko: 'GRENCH BOSS' },
    summary: {
      en: 'A co-op base-defense game built in Godot — fortify against waves of enemies, then take the fight further with a pilotable airship. In active development.',
      ko: 'Godot로 만드는 협동 기지 방어 게임입니다 — 적의 파도를 막아내고, 이제는 직접 조종하는 비행선으로 전선을 넓혀갑니다. 한창 개발 중입니다.',
    },
    role: { en: 'Design & engineering', ko: '기획 및 개발' },
    challenge: {
      en: 'Keep a co-op base-defense game responsive and fair when the screen fills with enemies, while giving players new ways to reach and defend territory beyond a single fixed base.',
      ko: '적으로 화면이 가득 차도 반응성과 공정함을 유지하면서, 하나의 고정된 기지를 넘어 새로운 방식으로 영역을 오가고 지킬 방법을 찾는 것이 과제였습니다.',
    },
    approach: {
      en: 'A lightweight custom simulation lets ordinary enemies move and fight without full physics bodies, freeing up budget for a modular base-building system and, most recently, a pilotable airship players can land to open new combat zones.',
      ko: '일반 적은 완전한 물리 바디 없이도 움직이고 싸울 수 있는 경량 시뮬레이션으로 처리해 여유를 확보하고, 그 여유를 모듈형 기지 건설 시스템과 최근 추가한 조종 가능한 비행선에 씁니다. 비행선은 착륙시켜 새로운 전투 구역을 엽니다.',
    },
    outcome: {
      en: 'The result stays smooth with large numbers of enemies on screen, with an airship-based expansion currently in active development ahead of a planned Steam demo.',
      ko: '많은 수의 적이 몰려도 매끄럽게 동작하며, 지금은 Steam 데모 공개를 목표로 비행선 기반 확장을 한창 개발 중입니다.',
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
    tags: ['Performance', 'Astro', 'Cloudflare'],
    title: { en: 'Edge-first static delivery', ko: '엣지 우선 정적 배포' },
    blurb: {
      en: "Every page is prebuilt HTML served from Cloudflare's global edge.",
      ko: '모든 페이지는 미리 빌드된 HTML로, Cloudflare의 전 세계 엣지에서 제공됩니다.',
    },
    detail: {
      en: 'No server to wait on, no cold starts, no database round trip. Pages are rendered at build time and cached in 300+ cities, so first paint is limited by the speed of light rather than by our infrastructure.',
      ko: '기다릴 서버도, 콜드 스타트도, 데이터베이스 왕복도 없습니다. 페이지는 빌드 시점에 렌더링되어 300여 개 도시에 캐싱되므로, 첫 화면 표시 속도는 인프라가 아니라 사실상 빛의 속도로만 제한됩니다.',
    },
  },
  {
    tags: ['Performance', 'Accessibility'],
    title: { en: 'Zero-JavaScript baseline', ko: '기본 JS 제로' },
    blurb: {
      en: 'Interactive only where interaction is the point.',
      ko: '인터랙션이 꼭 필요한 곳에만 인터랙션을 넣었습니다.',
    },
    detail: {
      en: 'Astro ships no client-side framework runtime by default. The handful of interactive pieces here — theme toggle, mobile menu, contact form — are small, self-contained scripts, so the site stays usable on slow connections and old hardware.',
      ko: 'Astro는 기본적으로 클라이언트 프레임워크 런타임을 전송하지 않습니다. 테마 전환, 모바일 메뉴, 문의 폼처럼 꼭 필요한 인터랙션만 작고 독립적인 스크립트로 처리해서, 느린 네트워크나 오래된 기기에서도 문제없이 동작합니다.',
    },
  },
  {
    tags: ['Security', 'Cloudflare'],
    title: { en: 'Hardened by default', ko: '기본값부터 단단하게' },
    blurb: {
      en: 'Strict security headers, no secrets in the repository.',
      ko: '엄격한 보안 헤더, 저장소엔 비밀값 없음.',
    },
    detail: {
      en: 'A content security policy, frame denial, and strict referrer rules ship with every response. The one server-side path — the contact endpoint — validates input, rate-limits by IP, and reads its API credentials from encrypted environment bindings that never touch source control.',
      ko: '모든 응답에 콘텐츠 보안 정책(CSP), 프레임 차단, 엄격한 리퍼러 규칙이 기본 적용됩니다. 유일한 서버 로직인 문의 엔드포인트는 입력값을 검증하고, IP 기준으로 속도를 제한하며, API 인증 정보는 소스 코드에 닿지 않는 암호화된 환경 바인딩에서만 읽어옵니다.',
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
