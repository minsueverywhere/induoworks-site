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

export type Project = {
  slug: string;
  year: string;
  stack: string[];
  href?: string;
  repo?: string;
  featured?: boolean;
  title: LocalizedText;
  summary: LocalizedText;
  role: LocalizedText;
};

export const projects: Project[] = [
  {
    slug: 'induoworks-site',
    year: '2026',
    stack: ['Astro', 'Tailwind CSS', 'Cloudflare Workers'],
    repo: 'https://github.com/minsueverywhere/induoworks-site',
    featured: true,
    title: { en: 'InduoWorks Site', ko: 'InduoWorks 웹사이트' },
    summary: {
      en: 'This site. Astro build on Cloudflare Workers — zero-JS by default, edge-cached worldwide, serverless contact handling.',
      ko: '지금 보고 계신 이 사이트입니다. Cloudflare Workers 위에서 동작하는 Astro 빌드로, 기본적으로 JS를 거의 쓰지 않고 전 세계에 엣지 캐싱되며, 문의 처리도 서버리스로 이루어집니다.',
    },
    role: { en: 'Design & build', ko: '설계 및 개발' },
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
};

export const companies: Company[] = [
  {
    slug: 'wispward',
    name: 'WISPWARD',
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
